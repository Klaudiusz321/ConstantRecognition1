/* CALC4.h - 36-button scientific RPN calculator definition
 * 
 * Author: Andrzej Odrzywolek
 * Date: January 2, 2025
 *
 * This file defines the standard CALC4 calculator:
 *   - 13 real constants (14 in complex builds, where I is added)
 *   - 18 unary functions
 *   - 5 binary operators
 *   Total: 36 real "buttons" (37 in complex builds)
 *
 * Usage:
 *   #include "CALC4.h"
 *   
 *   vsearch_core(MODE_CONSTANT, data, 1, MinK, MaxK, cpu_id, ncpus,
 *       CALC4_CONSTS, CALC4_N_CONST,
 *       CALC4_FUNCS,  CALC4_N_UNARY,
 *       CALC4_OPS,    CALC4_N_BINARY,
 *       ERROR_REL, COMPARE_STRICT);
 *
 * This is the "master" calculator for string-based operator selection
 * in the WASM wrapper.
 */

#ifndef CALC4_H
#define CALC4_H

#define _USE_MATH_DEFINES
#include <math.h>
#include "vsearch_RPN_core.h"
#include "math2.h"

#ifdef USE_COMPLEX
  #define CALC_LOG clog
  #define CALC_EXP cexp
  #define CALC_INV cinv
  #define CALC_GAMMA ctgamma
  #define CALC_SQRT csqrt
  #define CALC_SQR csqr
  #define CALC_SIN csin
  #define CALC_ASIN cr_casin
  #define CALC_COS ccos
  #define CALC_ACOS cr_cacos
  #define CALC_TAN ctan
  #define CALC_ATAN cr_catan
  #define CALC_SINH csinh
  #define CALC_ASINH cr_casinh
  #define CALC_COSH ccosh
  #define CALC_ACOSH cr_cacosh
  #define CALC_TANH ctanh
  #define CALC_ATANH cr_catanh
  
  #define CALC_PLUS cplus
  #define CALC_TIMES ctimes
  #define CALC_SUBTRACT csubtract
  #define CALC_DIVIDE cdivide
  #define CALC_POW cpow
#else
  #define CALC_LOG log
  #define CALC_EXP exp
  #define CALC_INV inv
  #define CALC_GAMMA tgamma
  #define CALC_SQRT sqrt
  #define CALC_SQR sqr
  #define CALC_SIN sin
  #define CALC_ASIN asin
  #define CALC_COS cos
  #define CALC_ACOS acos
  #define CALC_TAN tan
  #define CALC_ATAN atan
  #define CALC_SINH sinh
  #define CALC_ASINH asinh
  #define CALC_COSH cosh
  #define CALC_ACOSH acosh
  #define CALC_TANH tanh
  #define CALC_ATANH atanh
  
  #define CALC_PLUS plus
  #define CALC_TIMES times
  #define CALC_SUBTRACT subtract
  #define CALC_DIVIDE divide
  #define CALC_POW pow
#endif

/* ============================================================================
 * CONSTANTS (13 real, 14 complex)
 * 
 * Mathematical constants and small integers frequently used in formulas.
 * Order matters for string-based lookup in WASM wrapper.
 * ============================================================================ */

static const ConstOp CALC4_CONSTS[] = {
    { M_PI,                                  "PI"          },
    { M_E,                                   "EULER"       },
    { -1.0,                                  "NEG"         },
    { 1.61803398874989484820458683436563812, "GOLDENRATIO" },
#ifdef USE_COMPLEX
    { I,                                     "I"           },
#endif
    { 1.0,                                   "ONE"         },
    { 2.0,                                   "TWO"         },
    { 3.0,                                   "THREE"       },
    { 4.0,                                   "FOUR"        },
    { 5.0,                                   "FIVE"        },
    { 6.0,                                   "SIX"         },
    { 7.0,                                   "SEVEN"       },
    { 8.0,                                   "EIGHT"       },
    { 9.0,                                   "NINE"        }
};

#define CALC4_N_CONST ((int)ARRAY_SIZE(CALC4_CONSTS))

/* ============================================================================
 * UNARY FUNCTIONS (18)
 * 
 * Standard mathematical functions operating on a single value.
 * Includes logarithms, exponentials, trigonometric, and hyperbolic functions.
 * ============================================================================ */

static const UnaryOp CALC4_FUNCS[] = {
    { CALC_LOG,    "LOG"      },
    { CALC_EXP,    "EXP"      },
    { CALC_INV,    "INV"      },
    { CALC_GAMMA,  "GAMMA"    },
    { CALC_SQRT,   "SQRT"     },
    { CALC_SQR,    "SQR"      },
    { CALC_SIN,    "SIN"      },
    { CALC_ASIN,   "ARCSIN"   },
    { CALC_COS,    "COS"      },
    { CALC_ACOS,   "ARCCOS"   },
    { CALC_TAN,    "TAN"      },
    { CALC_ATAN,   "ARCTAN"   },
    { CALC_SINH,   "SINH"     },
    { CALC_ASINH,  "ARCSINH"  },
    { CALC_COSH,   "COSH"     },
    { CALC_ACOSH,  "ARCCOSH"  },
    { CALC_TANH,   "TANH"     },
    { CALC_ATANH,  "ARCTANH"  }
};

#define CALC4_N_UNARY ((int)ARRAY_SIZE(CALC4_FUNCS))

/* ============================================================================
 * BINARY OPERATORS (5)
 * 
 * Standard binary operations. Note: in RPN evaluation, operands are
 * popped in reverse order, so the function signature is func(b, a)
 * where 'a' was pushed first and 'b' second.
 * ============================================================================ */

static const BinaryOp CALC4_OPS[] = {
    { CALC_PLUS,     "PLUS"     },
    { CALC_TIMES,    "TIMES"    },
    { CALC_SUBTRACT, "SUBTRACT" },
    { CALC_DIVIDE,   "DIVIDE"   },
    { CALC_POW,      "POWER"    }
};

#define CALC4_N_BINARY ((int)ARRAY_SIZE(CALC4_OPS))

/* ============================================================================
 * TOTAL BUTTON COUNT
 * ============================================================================ */

#define CALC4_N_TOTAL (CALC4_N_CONST + CALC4_N_UNARY + CALC4_N_BINARY)

/* 
 * CALC4 has 36 real buttons (13 + 18 + 5). Complex builds add I, so
 * CALC4_N_TOTAL is 37 when USE_COMPLEX is enabled.
 */

#endif /* CALC4_H */
