/* bidirectional_search.c - bounded bidirectional/meet-in-the-middle search
 *
 * Scientific contract
 * -------------------
 * 1. K keeps its existing meaning: total number of RPN calculator tokens.
 * 2. All closed expressions through BIDIRECTIONAL_FRONTIER_K are generated
 *    exactly by dynamic programming over the RPN grammar.
 * 3. Longer candidates are assembled by a target-side inverse lookup at a
 *    binary root.  PLUS, TIMES, SUBTRACT and DIVIDE have safe conditional
 *    inverses in the real finite domain.  POWER and non-finite branches are
 *    deliberately left to the existing forward fallback.
 * 4. No lossy Top-N pruning is used in a frontier.  A hard entry cap fails
 *    closed and asks the caller to use the streaming fallback.
 * 5. The JSON report says whether minimality is already proved and which
 *    shorter levels still require the forward verifier.
 */

#ifdef _WIN32
#define strdup _strdup
#endif

#include <float.h>
#include <math.h>
#include <stdint.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>

#include "bidirectional_search.h"

#define BIDI_MAX_FRONTIER_ENTRIES 150000u
#define BIDI_JSON_BYTES 8192u
#define BIDI_EXACT_ULPS 16.0

typedef enum {
    BIDI_CONSTANT = 0,
    BIDI_UNARY = 1,
    BIDI_BINARY = 2
} BidiTokenKind;

typedef struct {
    uint8_t kind;
    uint8_t index;
} BidiToken;

typedef struct {
    double value;
    uint8_t length;
    BidiToken tokens[BIDIRECTIONAL_FRONTIER_K];
} FrontierEntry;

typedef struct {
    FrontierEntry* entries;
    size_t count;
    size_t capacity;
} Frontier;

typedef struct {
    int present;
    int accepted;
    int K;
    double value;
    double relative_error;
    double compression_ratio;
    BidiToken tokens[BIDIRECTIONAL_MAX_K];
} BidiCandidate;

static char* bidi_error_json(const char* message) {
    char* out = (char*)malloc(BIDI_JSON_BYTES);
    if (!out) return strdup("{\"result\":\"ERROR\",\"status\":\"ERROR\",\"error\":\"Memory allocation failed\"}");
    snprintf(out, BIDI_JSON_BYTES,
             "{\"result\":\"ERROR\",\"status\":\"ERROR\",\"strategy\":\"BIDIRECTIONAL_MITM\",\"error\":\"%s\"}",
             message ? message : "Unknown bidirectional search error");
    return out;
}

static int checked_add_size(size_t left, size_t right, size_t* out) {
    if (left > SIZE_MAX - right) return 0;
    *out = left + right;
    return 1;
}

static int checked_mul_size(size_t left, size_t right, size_t* out) {
    if (left != 0 && right > SIZE_MAX / left) return 0;
    *out = left * right;
    return 1;
}

static int compare_frontier_values(const void* left_ptr, const void* right_ptr) {
    const FrontierEntry* left = (const FrontierEntry*)left_ptr;
    const FrontierEntry* right = (const FrontierEntry*)right_ptr;
    if (left->value < right->value) return -1;
    if (left->value > right->value) return 1;
    return 0;
}

static double relative_error(double value, double target) {
    if (!isfinite(value)) return DBL_MAX;
    return target == 0.0 ? fabs(value) : fabs(value / target - 1.0);
}

static double compression_ratio(double error, int K, int instruction_count) {
    if (K <= 0 || instruction_count <= 1 || !isfinite(error) || error >= 1.0) return 0.0;
    if (error == 0.0) return 16.0 / ((double)K * log10((double)instruction_count));
    return -log10(error) / ((double)K * log10((double)instruction_count));
}

static int candidate_is_accepted(
    double value, double target, double delta,
    double error, double compression, double cr_threshold)
{
    if (error <= BIDI_EXACT_ULPS * DBL_EPSILON) return 1;
    return delta > 0.0 &&
           fabs(value - target) <= 2.0 * delta &&
           compression >= cr_threshold;
}

static void consider_candidate(
    BidiCandidate* best,
    const BidiToken* tokens, int K,
    double value, double target, double delta,
    int instruction_count, double cr_threshold)
{
    if (!isfinite(value) || K < 1 || K > BIDIRECTIONAL_MAX_K) return;
    double error = relative_error(value, target);
    double cr = compression_ratio(error, K, instruction_count);
    int accepted = candidate_is_accepted(value, target, delta, error, cr, cr_threshold);

    if (!best->present ||
        (accepted && !best->accepted) ||
        (accepted == best->accepted && error < best->relative_error) ||
        (accepted == best->accepted && error == best->relative_error && K < best->K)) {
        best->present = 1;
        best->accepted = accepted;
        best->K = K;
        best->value = value;
        best->relative_error = error;
        best->compression_ratio = cr;
        memcpy(best->tokens, tokens, (size_t)K * sizeof(BidiToken));
    }
}

static int frontier_append(Frontier* frontier, const FrontierEntry* entry) {
    if (frontier->count >= frontier->capacity) return 0;
    frontier->entries[frontier->count++] = *entry;
    return 1;
}

static size_t frontier_lower_bound(const Frontier* frontier, double value) {
    size_t low = 0;
    size_t high = frontier->count;
    while (low < high) {
        size_t middle = low + (high - low) / 2;
        if (frontier->entries[middle].value < value) low = middle + 1;
        else high = middle;
    }
    return low;
}

static int root_inverse_target(const char* op_name, double target, double below, double* desired_top) {
    if (strcmp(op_name, "PLUS") == 0) {
        *desired_top = target - below;
        return isfinite(*desired_top);
    }
    if (strcmp(op_name, "SUBTRACT") == 0) {
        /* Core order is top - below. */
        *desired_top = target + below;
        return isfinite(*desired_top);
    }
    if (strcmp(op_name, "TIMES") == 0) {
        if (below == 0.0) return 0;
        *desired_top = target / below;
        return isfinite(*desired_top);
    }
    if (strcmp(op_name, "DIVIDE") == 0) {
        /* Core order is top / below. */
        if (below == 0.0) return 0;
        *desired_top = target * below;
        return isfinite(*desired_top);
    }
    return 0;
}

static int root_operator_is_supported(const char* op_name) {
    return strcmp(op_name, "PLUS") == 0 ||
           strcmp(op_name, "TIMES") == 0 ||
           strcmp(op_name, "SUBTRACT") == 0 ||
           strcmp(op_name, "DIVIDE") == 0;
}

static void concatenate_root_candidate(
    BidiToken* out,
    const FrontierEntry* below,
    const FrontierEntry* top,
    int binary_index)
{
    memcpy(out, below->tokens, (size_t)below->length * sizeof(BidiToken));
    memcpy(out + below->length, top->tokens, (size_t)top->length * sizeof(BidiToken));
    out[below->length + top->length].kind = BIDI_BINARY;
    out[below->length + top->length].index = (uint8_t)binary_index;
}

static void format_candidate(
    const BidiCandidate* candidate,
    const ConstOp* const_ops,
    const UnaryOp* unary_ops,
    const BinaryOp* binary_ops,
    char* out, size_t out_size)
{
    size_t used = 0;
    if (!candidate->present || out_size == 0) {
        if (out_size > 0) out[0] = '\0';
        return;
    }
    for (int i = 0; i < candidate->K; i++) {
        const BidiToken token = candidate->tokens[i];
        const char* name = token.kind == BIDI_CONSTANT ? const_ops[token.index].name
            : token.kind == BIDI_UNARY ? unary_ops[token.index].name
            : binary_ops[token.index].name;
        int written = snprintf(out + used, out_size - used, "%s%s", i == 0 ? "" : ", ", name);
        if (written < 0 || (size_t)written >= out_size - used) {
            out[out_size - 1] = '\0';
            return;
        }
        used += (size_t)written;
    }
}

static void free_frontiers(Frontier* frontiers) {
    for (int K = 1; K <= BIDIRECTIONAL_FRONTIER_K; K++) {
        free(frontiers[K].entries);
        frontiers[K].entries = NULL;
        frontiers[K].count = 0;
        frontiers[K].capacity = 0;
    }
}

char* search_bidirectional_constant(
    double target, double delta,
    int MaxK,
    const ConstOp* const_ops, int n_const,
    const UnaryOp* unary_ops, int n_unary,
    const BinaryOp* binary_ops, int n_binary,
    double cr_threshold)
{
    if (!isfinite(target) || !isfinite(delta) || delta < 0.0) {
        return bidi_error_json("Target and uncertainty must be finite, with uncertainty >= 0");
    }
    if (MaxK < 1 || MaxK > BIDIRECTIONAL_MAX_K) {
        return bidi_error_json("Bidirectional search supports 1 <= K <= 9");
    }
    if (n_const < 1 || n_const > UINT8_MAX || n_unary < 0 || n_unary > UINT8_MAX ||
        n_binary < 0 || n_binary > UINT8_MAX || !const_ops ||
        (n_unary > 0 && !unary_ops) || (n_binary > 0 && !binary_ops)) {
        return bidi_error_json("Invalid calculator instruction set");
    }
    if (!isfinite(cr_threshold) || cr_threshold < 0.0) {
        return bidi_error_json("Compression-ratio threshold must be finite and non-negative");
    }

    const int frontier_max_k = MaxK < BIDIRECTIONAL_FRONTIER_K
        ? MaxK : BIDIRECTIONAL_FRONTIER_K;
    const int instruction_count = n_const + n_unary + n_binary;
    size_t theoretical[BIDIRECTIONAL_FRONTIER_K + 1] = {0};
    theoretical[1] = (size_t)n_const;
    size_t total_capacity = theoretical[1];

    for (int K = 2; K <= frontier_max_k; K++) {
        size_t level_count = 0;
        size_t unary_count = 0;
        if (!checked_mul_size((size_t)n_unary, theoretical[K - 1], &unary_count) ||
            !checked_add_size(level_count, unary_count, &level_count)) {
            return bidi_error_json("Bidirectional frontier size overflow");
        }
        for (int left_k = 1; left_k <= K - 2; left_k++) {
            int right_k = K - 1 - left_k;
            size_t pair_count = 0;
            size_t rooted_count = 0;
            if (!checked_mul_size(theoretical[left_k], theoretical[right_k], &pair_count) ||
                !checked_mul_size(pair_count, (size_t)n_binary, &rooted_count) ||
                !checked_add_size(level_count, rooted_count, &level_count)) {
                return bidi_error_json("Bidirectional frontier size overflow");
            }
        }
        theoretical[K] = level_count;
        if (level_count > BIDI_MAX_FRONTIER_ENTRIES ||
            !checked_add_size(total_capacity, level_count, &total_capacity) ||
            total_capacity > BIDI_MAX_FRONTIER_ENTRIES) {
            return bidi_error_json("Bidirectional frontier exceeds the 150000-entry memory cap");
        }
    }

    Frontier frontiers[BIDIRECTIONAL_FRONTIER_K + 1] = {0};
    for (int K = 1; K <= frontier_max_k; K++) {
        frontiers[K].capacity = theoretical[K];
        if (theoretical[K] == 0) continue;
        frontiers[K].entries = (FrontierEntry*)calloc(theoretical[K], sizeof(FrontierEntry));
        if (!frontiers[K].entries) {
            free_frontiers(frontiers);
            return bidi_error_json("Unable to allocate the bounded bidirectional frontier");
        }
    }

    for (int constant_index = 0; constant_index < n_const; constant_index++) {
        if (!isfinite(const_ops[constant_index].value)) continue;
        FrontierEntry entry = {0};
        entry.value = const_ops[constant_index].value;
        entry.length = 1;
        entry.tokens[0].kind = BIDI_CONSTANT;
        entry.tokens[0].index = (uint8_t)constant_index;
        if (!frontier_append(&frontiers[1], &entry)) {
            free_frontiers(frontiers);
            return bidi_error_json("Bidirectional frontier accounting mismatch");
        }
    }
    qsort(frontiers[1].entries, frontiers[1].count, sizeof(FrontierEntry), compare_frontier_values);

    uint64_t generated_expressions = frontiers[1].count;
    for (int K = 2; K <= frontier_max_k; K++) {
        Frontier* destination = &frontiers[K];
        const Frontier* child_frontier = &frontiers[K - 1];
        for (size_t child_index = 0; child_index < child_frontier->count; child_index++) {
            const FrontierEntry* child = &child_frontier->entries[child_index];
            for (int unary_index = 0; unary_index < n_unary; unary_index++) {
                double value = unary_ops[unary_index].func(child->value);
                if (!isfinite(value)) continue;
                FrontierEntry entry = {0};
                entry.value = value;
                entry.length = (uint8_t)K;
                memcpy(entry.tokens, child->tokens, child->length * sizeof(BidiToken));
                entry.tokens[child->length].kind = BIDI_UNARY;
                entry.tokens[child->length].index = (uint8_t)unary_index;
                if (!frontier_append(destination, &entry)) {
                    free_frontiers(frontiers);
                    return bidi_error_json("Bidirectional frontier accounting mismatch");
                }
            }
        }
        for (int left_k = 1; left_k <= K - 2; left_k++) {
            int right_k = K - 1 - left_k;
            const Frontier* below_frontier = &frontiers[left_k];
            const Frontier* top_frontier = &frontiers[right_k];
            for (size_t below_index = 0; below_index < below_frontier->count; below_index++) {
                const FrontierEntry* below = &below_frontier->entries[below_index];
                for (size_t top_index = 0; top_index < top_frontier->count; top_index++) {
                    const FrontierEntry* top = &top_frontier->entries[top_index];
                    for (int binary_index = 0; binary_index < n_binary; binary_index++) {
                        double value = binary_ops[binary_index].func(top->value, below->value);
                        if (!isfinite(value)) continue;
                        FrontierEntry entry = {0};
                        entry.value = value;
                        entry.length = (uint8_t)K;
                        concatenate_root_candidate(entry.tokens, below, top, binary_index);
                        if (!frontier_append(destination, &entry)) {
                            free_frontiers(frontiers);
                            return bidi_error_json("Bidirectional frontier accounting mismatch");
                        }
                    }
                }
            }
        }
        generated_expressions += destination->count;
        qsort(destination->entries, destination->count, sizeof(FrontierEntry), compare_frontier_values);
    }

    BidiCandidate best = {0};
    uint64_t join_evaluations = 0;
    int accepted_level = 0;

    /* Frontiers through K=4 are complete grammar levels, not a heuristic. */
    for (int K = 1; K <= frontier_max_k && !accepted_level; K++) {
        for (size_t index = 0; index < frontiers[K].count; index++) {
            const FrontierEntry* entry = &frontiers[K].entries[index];
            consider_candidate(&best, entry->tokens, K, entry->value, target, delta,
                               instruction_count, cr_threshold);
            join_evaluations++;
            if (best.accepted && best.K == K) {
                accepted_level = K;
                break;
            }
        }
    }

    /* Longer levels use a real target-side inverse lookup at a binary root. */
    for (int K = BIDIRECTIONAL_FRONTIER_K + 1;
         K <= MaxK && !accepted_level;
         K++) {
        BidiCandidate level_best = {0};
        for (int below_k = 1; below_k <= frontier_max_k; below_k++) {
            int top_k = K - 1 - below_k;
            if (top_k < 1 || top_k > frontier_max_k) continue;
            const Frontier* below_frontier = &frontiers[below_k];
            const Frontier* top_frontier = &frontiers[top_k];
            if (top_frontier->count == 0) continue;

            for (int binary_index = 0; binary_index < n_binary; binary_index++) {
                const char* op_name = binary_ops[binary_index].name;
                if (!root_operator_is_supported(op_name)) continue;
                for (size_t below_index = 0; below_index < below_frontier->count; below_index++) {
                    const FrontierEntry* below = &below_frontier->entries[below_index];

                    if (strcmp(op_name, "TIMES") == 0 && below->value == 0.0) {
                        const FrontierEntry* top = &top_frontier->entries[0];
                        BidiToken tokens[BIDIRECTIONAL_MAX_K] = {0};
                        concatenate_root_candidate(tokens, below, top, binary_index);
                        double value = binary_ops[binary_index].func(top->value, below->value);
                        consider_candidate(&level_best, tokens, K, value, target, delta,
                                           instruction_count, cr_threshold);
                        join_evaluations++;
                        continue;
                    }

                    double desired_top = 0.0;
                    if (!root_inverse_target(op_name, target, below->value, &desired_top)) continue;
                    size_t insertion = frontier_lower_bound(top_frontier, desired_top);
                    size_t candidates[3];
                    size_t candidate_count = 0;
                    if (insertion > 0) candidates[candidate_count++] = insertion - 1;
                    if (insertion < top_frontier->count) candidates[candidate_count++] = insertion;
                    if (insertion + 1 < top_frontier->count) candidates[candidate_count++] = insertion + 1;

                    for (size_t candidate_index = 0; candidate_index < candidate_count; candidate_index++) {
                        const FrontierEntry* top = &top_frontier->entries[candidates[candidate_index]];
                        BidiToken tokens[BIDIRECTIONAL_MAX_K] = {0};
                        concatenate_root_candidate(tokens, below, top, binary_index);
                        double value = binary_ops[binary_index].func(top->value, below->value);
                        consider_candidate(&level_best, tokens, K, value, target, delta,
                                           instruction_count, cr_threshold);
                        join_evaluations++;
                    }
                }
            }
        }
        if (level_best.present &&
            (!best.present || (level_best.accepted && !best.accepted) ||
             (level_best.accepted == best.accepted && level_best.relative_error < best.relative_error))) {
            best = level_best;
        }
        if (level_best.accepted) accepted_level = K;
    }

    int supported_root_operators = 0;
    for (int i = 0; i < n_binary; i++) {
        if (root_operator_is_supported(binary_ops[i].name)) supported_root_operators++;
    }
    int complete_through_k = MaxK < BIDIRECTIONAL_FRONTIER_K
        ? MaxK : BIDIRECTIONAL_FRONTIER_K;
    int minimality_proven = best.accepted && best.K <= BIDIRECTIONAL_FRONTIER_K + 1;
    int fallback_required = best.accepted
        ? !minimality_proven
        : MaxK > complete_through_k;
    int fallback_max_k = best.accepted ? best.K - 1 : MaxK;

    char rpn[512];
    format_candidate(&best, const_ops, unary_ops, binary_ops, rpn, sizeof(rpn));
    char* json = (char*)malloc(BIDI_JSON_BYTES);
    if (!json) {
        free_frontiers(frontiers);
        return bidi_error_json("Unable to allocate the bidirectional report");
    }

    size_t frontier_bytes = total_capacity * sizeof(FrontierEntry);
    snprintf(json, BIDI_JSON_BYTES,
        "{"
        "\"result\":\"%s\","
        "\"status\":\"FINISHED\","
        "\"strategy\":\"BIDIRECTIONAL_MITM\","
        "\"RPN\":\"%s\","
        "\"K\":%d,"
        "\"value\":%.17g,"
        "\"REL_ERR\":%.17e,"
        "\"COMPRESSION_RATIO\":%.17g,"
        "\"maxK\":%d,"
        "\"frontier_max_k\":%d,"
        "\"complete_through_k\":%d,"
        "\"minimality_proven\":%s,"
        "\"fallback_required\":%s,"
        "\"fallback_max_k\":%d,"
        "\"frontier_entries\":%llu,"
        "\"frontier_capacity_entries\":%llu,"
        "\"frontier_bytes\":%llu,"
        "\"join_evaluations\":%llu,"
        "\"supported_root_operators\":%d,"
        "\"total_root_operators\":%d,"
        "\"memory_model\":\"BOUNDED_HALF_FRONTIER\""
        "}",
        best.accepted ? "SUCCESS" : (best.present ? "BEST" : "FAILURE"),
        rpn,
        best.present ? best.K : 0,
        best.present ? best.value : 0.0,
        best.present ? best.relative_error : DBL_MAX,
        best.present ? best.compression_ratio : 0.0,
        MaxK,
        frontier_max_k,
        complete_through_k,
        minimality_proven ? "true" : "false",
        fallback_required ? "true" : "false",
        fallback_max_k,
        (unsigned long long)generated_expressions,
        (unsigned long long)total_capacity,
        (unsigned long long)frontier_bytes,
        (unsigned long long)join_evaluations,
        supported_root_operators,
        n_binary);

    free_frontiers(frontiers);
    return json;
}
