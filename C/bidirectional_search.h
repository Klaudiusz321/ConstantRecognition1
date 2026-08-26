/* bidirectional_search.h - bounded meet-in-the-middle constant search
 *
 * This is an independent experimental search engine.  It builds bounded
 * forward frontiers of short, closed RPN expressions and joins them from the
 * numerical target side.  The existing streaming enumerator remains the
 * completeness fallback for grammar partitions that the inverse join does
 * not cover.
 */

#ifndef BIDIRECTIONAL_SEARCH_H
#define BIDIRECTIONAL_SEARCH_H

#include "vsearch_RPN_core.h"

#define BIDIRECTIONAL_MAX_K 9
#define BIDIRECTIONAL_FRONTIER_K 4

char* search_bidirectional_constant(
    double target, double delta,
    int MaxK,
    const ConstOp* const_ops, int n_const,
    const UnaryOp* unary_ops, int n_unary,
    const BinaryOp* binary_ops, int n_binary,
    double cr_threshold);

#endif /* BIDIRECTIONAL_SEARCH_H */
