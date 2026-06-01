'use client';

import { useMemo } from 'react';
import katex from 'katex';

interface LatexProps {
  formula: string;
  className?: string;
}

export function Latex({ formula, className = '' }: LatexProps) {
  const html = useMemo(() => {
    try {
      return katex.renderToString(formula, {
        throwOnError: false,
        displayMode: false,
        trust: true,
        strict: false,
      });
    } catch {
      return formula;
    }
  }, [formula]);

  return (
    <span 
      className={className}
      dangerouslySetInnerHTML={{ __html: html }} 
    />
  );
}
