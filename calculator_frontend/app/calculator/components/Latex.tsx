'use client';

import { useMemo } from 'react';
import katex from 'katex';

interface LatexProps {
  formula: string;
  className?: string;
}

export function Latex({ formula, className = '' }: LatexProps) {
  const rendered = useMemo(() => {
    try {
      return {
        html: katex.renderToString(formula, {
          throwOnError: false,
          displayMode: false,
          trust: true,
          strict: false,
        }),
        isHtml: true,
      };
    } catch {
      return { html: formula, isHtml: false };
    }
  }, [formula]);

  const rootClassName = [
    'inline-block max-w-full align-middle leading-normal',
    className,
  ].filter(Boolean).join(' ');

  if (!rendered.isHtml) {
    return <span className={rootClassName}>{rendered.html}</span>;
  }

  return (
    <span 
      className={rootClassName}
      dangerouslySetInnerHTML={{ __html: rendered.html }}
    />
  );
}
