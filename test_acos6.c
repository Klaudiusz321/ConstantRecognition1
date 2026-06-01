#include <stdio.h>
#include <complex.h>

int main() {
    double complex z_plus = -2.0 + 0.0 * I;
    double complex z_minus = -2.0 - 0.0 * I;
    
    double complex a_plus = cacos(z_plus);
    double complex a_minus = cacos(z_minus);
    
    double complex t_plus = ctan(a_plus);
    double complex t_minus = ctan(a_minus);
    
    printf("cacos(-2 + 0i) = %f %f, ctan = %f %f\n", creal(a_plus), cimag(a_plus), creal(t_plus), cimag(t_plus));
    printf("cacos(-2 - 0i) = %f %f, ctan = %f %f\n", creal(a_minus), cimag(a_minus), creal(t_minus), cimag(t_minus));
    return 0;
}
