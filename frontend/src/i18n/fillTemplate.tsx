import React from 'react';

/** Replace {name} placeholders with React nodes, e.g. values wrapped in <bdi> inside RTL sentences. */
export function fillTemplate(template: string, values: Record<string, React.ReactNode>): React.ReactNode {
  return template.split(/(\{\w+\})/).map((part, i) => {
    const key = /^\{(\w+)\}$/.exec(part)?.[1];
    return key !== undefined && key in values ? <React.Fragment key={i}>{values[key]}</React.Fragment> : part;
  });
}

/** Plain-string variant for places that cannot hold markup (toasts, aria-labels). */
export function formatText(template: string, values: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (match, key: string) => (key in values ? String(values[key]) : match));
}
