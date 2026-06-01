#include <stdio.h>
#include <complex.h>
#include <emscripten.h>

EMSCRIPTEN_KEEPALIVE
double test_cacos_imag(double x) {
    return cimag(cacos(x));
}
