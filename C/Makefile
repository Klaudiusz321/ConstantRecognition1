# Makefile for ConstantRecognition project
#
# Author: Andrzej Odrzywolek
# Code assist: Claude 4.5 Opus, January 2025

CC=gcc
CFLAGS=-O2 -Wall
LDFLAGS=-lm

ifeq ($(CC),icx)
    CFLAGS=-Wall -O2 -ipo
    LDFLAGS=
endif

# New unified search (recommended)
vsearch_batch: vsearch_batch.c vsearch_RPN_core.c utils.c
	$(CC) $(CFLAGS) vsearch_batch.c vsearch_RPN_core.c utils.c -o vsearch_batch $(LDFLAGS)

# Standalone test
vsearch_test: main_vsearch_test.c vsearch_RPN_core.c utils.c
	$(CC) $(CFLAGS) main_vsearch_test.c vsearch_RPN_core.c utils.c -o vsearch_test $(LDFLAGS)

# WASM build (requires emcc)
wasm: vsearch_RPN_wasm.c vsearch_RPN_core.c bidirectional_search.c utils.c
	emcc -O2 -Wall vsearch_RPN_wasm.c vsearch_RPN_core.c bidirectional_search.c utils.c -s WASM=1 -s EXPORTED_FUNCTIONS='["_search_RPN","_search_RPN_with_cr","_search_RPN_hybrid","_search_RPN_custom","_search_RPN_custom_with_cr","_search_function_wasm","_search_function_custom_wasm","_search_multivariate_wasm","_search_multivariate_custom_wasm","_search_batch_wasm","_search_batch_with_cr_wasm","_search_batch_custom_wasm","_search_batch_custom_with_cr_wasm","_search_bidirectional_wasm","_vsearch_RPN","_free","_malloc"]' -s EXPORTED_RUNTIME_METHODS='["ccall","cwrap"]' -o vsearch.js

bidirectional_test: test/test_bidirectional_search.c bidirectional_search.c vsearch_RPN_core.c utils.c
	$(CC) $(CFLAGS) test/test_bidirectional_search.c bidirectional_search.c vsearch_RPN_core.c utils.c -o bidirectional_test $(LDFLAGS)

# Legacy builds (math2.h is header-only, no .c file)
DEPS = constant.c mathematica.c utils.c
SRC = ConstantRecognition_batch.c
OBJ_REAL = RealConstantRecognition_batch.o $(DEPS:.c=.o)
OBJ_CPLX = ComplexConstantRecognition_batch.o $(DEPS:.c=.o)

legacy: RealConstantRecognition ComplexConstantRecognition

RealConstantRecognition_batch.o: $(SRC) $(DEPS)
	$(CC) -c -o $@ $(SRC) $(CFLAGS) -DSEARCH_TYPE=REAL_DBL

ComplexConstantRecognition_batch.o: $(SRC) $(DEPS)
	$(CC) -c -o $@ $(SRC) $(CFLAGS) -DSEARCH_TYPE=CPLX_DBL

RealConstantRecognition: $(OBJ_REAL)
	$(CC) -o $@ $^ $(CFLAGS) $(LDFLAGS)

ComplexConstantRecognition: $(OBJ_CPLX)
	$(CC) -o $@ $^ $(CFLAGS) $(LDFLAGS)

# CASIO calculator test
casio_test: calc/CASIO_test.c vsearch_RPN_core.c utils.c
	$(CC) $(CFLAGS) calc/CASIO_test.c vsearch_RPN_core.c utils.c -o casio_test $(LDFLAGS)

.PHONY: clean all wasm legacy

all: vsearch_batch vsearch_test

clean:
	rm -f $(OBJ_REAL) $(OBJ_CPLX) RealConstantRecognition ComplexConstantRecognition
	rm -f vsearch_batch vsearch_test casio_test
	rm -f found.txt *.o
