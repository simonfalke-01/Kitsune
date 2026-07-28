'use client';

import { Fragment, type ReactNode } from 'react';

import { CodeBlock } from './code-block';
import { Link } from './link';
import { safeHref } from './safe-href';
import { cx } from './styles';

type AuthoredBlock =
  | { depth: number; text: string; type: 'heading' }
  | { language: string; text: string; type: 'code' }
  | { items: string[]; ordered: boolean; type: 'list' }
  | { text: string; type: 'paragraph' }
  | { rows: string[][]; type: 'table' }
  | { text: string; type: 'quote' }
  | { type: 'rule' };

export interface AuthoredContentProps {
  className?: string;
  content: string;
}

const headingPattern = /^ {0,3}(#{1,4})\s+(.+)$/;
const orderedListPattern = /^ {0,3}\d+[.)]\s+(.+)$/;
const unorderedListPattern = /^ {0,3}[-+*]\s+(.+)$/;
const tableDividerPattern = /^\s*\|?\s*:?-{3,}:?\s*(?:\|\s*:?-{3,}:?\s*)+\|?\s*$/;

function isRule(line: string): boolean {
  return /^ {0,3}(?:-{3,}|\*{3,}|_{3,})\s*$/.test(line);
}

function isBlockStart(lines: string[], index: number): boolean {
  const line = lines[index] ?? '';

  return (
    line.trim() === '' ||
    line.trimStart().startsWith('```') ||
    headingPattern.test(line) ||
    orderedListPattern.test(line) ||
    unorderedListPattern.test(line) ||
    /^ {0,3}>\s?/.test(line) ||
    isRule(line) ||
    (line.includes('|') && tableDividerPattern.test(lines[index + 1] ?? ''))
  );
}

function tableCells(line: string): string[] {
  const trimmed = line.trim().replace(/^\|/, '').replace(/\|$/, '');
  return trimmed.split('|').map((cell) => cell.trim());
}

export function parseAuthoredContent(content: string): AuthoredBlock[] {
  const lines = content.replace(/\r\n?/g, '\n').split('\n');
  const blocks: AuthoredBlock[] = [];
  let index = 0;

  while (index < lines.length) {
    const line = lines[index] ?? '';

    if (line.trim() === '') {
      index += 1;
      continue;
    }

    const fence = line.trimStart().match(/^```([^`]*)$/);

    if (fence) {
      const language = fence[1]?.trim() ?? '';
      const code: string[] = [];
      index += 1;

      while (index < lines.length && !lines[index]?.trimStart().startsWith('```')) {
        code.push(lines[index] ?? '');
        index += 1;
      }

      if (index < lines.length) {
        index += 1;
      }

      blocks.push({ language, text: code.join('\n'), type: 'code' });
      continue;
    }

    const heading = line.match(headingPattern);

    if (heading) {
      blocks.push({
        depth: heading[1]?.length ?? 1,
        text: heading[2]?.trim() ?? '',
        type: 'heading'
      });
      index += 1;
      continue;
    }

    if (line.includes('|') && tableDividerPattern.test(lines[index + 1] ?? '')) {
      const rows = [tableCells(line)];
      index += 2;

      while (index < lines.length && (lines[index] ?? '').includes('|')) {
        rows.push(tableCells(lines[index] ?? ''));
        index += 1;
      }

      blocks.push({ rows, type: 'table' });
      continue;
    }

    const orderedItem = line.match(orderedListPattern);
    const unorderedItem = line.match(unorderedListPattern);

    if (orderedItem || unorderedItem) {
      const ordered = Boolean(orderedItem);
      const pattern = ordered ? orderedListPattern : unorderedListPattern;
      const items: string[] = [];

      while (index < lines.length) {
        const item = (lines[index] ?? '').match(pattern);

        if (!item) {
          break;
        }

        items.push(item[1]?.trim() ?? '');
        index += 1;
      }

      blocks.push({ items, ordered, type: 'list' });
      continue;
    }

    if (/^ {0,3}>\s?/.test(line)) {
      const quote: string[] = [];

      while (index < lines.length && /^ {0,3}>\s?/.test(lines[index] ?? '')) {
        quote.push((lines[index] ?? '').replace(/^ {0,3}>\s?/, '').trim());
        index += 1;
      }

      blocks.push({ text: quote.join(' '), type: 'quote' });
      continue;
    }

    if (isRule(line)) {
      blocks.push({ type: 'rule' });
      index += 1;
      continue;
    }

    const paragraph: string[] = [line.trim()];
    index += 1;

    while (index < lines.length && !isBlockStart(lines, index)) {
      paragraph.push((lines[index] ?? '').trim());
      index += 1;
    }

    blocks.push({ text: paragraph.join(' '), type: 'paragraph' });
  }

  return blocks;
}

type InlineToken = {
  index: number;
  length: number;
  node: (key: string) => ReactNode;
};

function nextInlineToken(text: string): InlineToken | null {
  const candidates: InlineToken[] = [];
  const code = /`([^`\n]+)`/.exec(text);
  const link = /\[([^\]\n]+)]\(([^)\s]+)\)/.exec(text);
  const strong = /\*\*([^*\n]+)\*\*/.exec(text);
  const emphasis = /(?:^|[^*])\*([^*\n]+)\*/.exec(text);

  if (code?.index !== undefined) {
    candidates.push({
      index: code.index,
      length: code[0].length,
      node: (key) => (
        <code
          className="rounded-sm border border-border-subtle bg-surface-sunken px-1 font-mono text-sm text-text"
          key={key}
        >
          {code[1]}
        </code>
      )
    });
  }

  if (link?.index !== undefined) {
    const href = safeHref(link[2] ?? '');
    candidates.push({
      index: link.index,
      length: link[0].length,
      node: (key) =>
        href ? (
          <Link href={href} key={key}>
            {inlineContent(link[1] ?? '')}
          </Link>
        ) : (
          <Fragment key={key}>{link[1]}</Fragment>
        )
    });
  }

  if (strong?.index !== undefined) {
    candidates.push({
      index: strong.index,
      length: strong[0].length,
      node: (key) => <strong key={key}>{inlineContent(strong[1] ?? '')}</strong>
    });
  }

  if (emphasis?.index !== undefined) {
    const prefixLength = emphasis[0].startsWith('*') ? 0 : 1;
    candidates.push({
      index: emphasis.index + prefixLength,
      length: emphasis[0].length - prefixLength,
      node: (key) => <em key={key}>{inlineContent(emphasis[1] ?? '')}</em>
    });
  }

  return candidates.sort((left, right) => left.index - right.index)[0] ?? null;
}

function inlineContent(text: string): ReactNode[] {
  const nodes: ReactNode[] = [];
  let remaining = text;
  let key = 0;

  while (remaining) {
    const token = nextInlineToken(remaining);

    if (!token) {
      nodes.push(remaining);
      break;
    }

    if (token.index > 0) {
      nodes.push(remaining.slice(0, token.index));
    }

    nodes.push(token.node(`inline-${key}`));
    remaining = remaining.slice(token.index + token.length);
    key += 1;
  }

  return nodes;
}

export function AuthoredContent({ className, content }: AuthoredContentProps) {
  const blocks = parseAuthoredContent(content);

  return (
    <div className={cx('grid max-w-prose gap-4 text-base text-text-muted', className)}>
      {blocks.map((block, index) => {
        const key = `${block.type}-${index}`;

        if (block.type === 'heading') {
          const classes =
            block.depth === 1
              ? 'm-0 pt-2 font-display text-lg font-semibold tracking-tight text-text first:pt-0'
              : 'm-0 pt-2 text-base font-semibold text-text first:pt-0';

          return block.depth === 1 ? (
            <h3 className={classes} key={key}>
              {inlineContent(block.text)}
            </h3>
          ) : (
            <h4 className={classes} key={key}>
              {inlineContent(block.text)}
            </h4>
          );
        }

        if (block.type === 'code') {
          return (
            <CodeBlock
              code={block.text}
              key={key}
              label={block.language || 'Code'}
              language={block.language || 'text'}
            />
          );
        }

        if (block.type === 'list') {
          const List = block.ordered ? 'ol' : 'ul';
          return (
            <List
              className={cx('m-0 grid gap-2 pl-6', block.ordered ? 'list-decimal' : 'list-disc')}
              key={key}
            >
              {block.items.map((item, itemIndex) => (
                <li key={`${key}-${itemIndex}`}>{inlineContent(item)}</li>
              ))}
            </List>
          );
        }

        if (block.type === 'table') {
          const [headings = [], ...rows] = block.rows;

          return (
            <div
              aria-label="Scrollable authored table"
              className={cx(
                'overflow-x-auto rounded-md border border-border-subtle outline-none',
                'focus-visible:outline-2 focus-visible:outline-solid focus-visible:outline-offset-2',
                'focus-visible:outline-focus-ring'
              )}
              key={key}
              role="region"
              tabIndex={0}
            >
              <table className="w-full border-collapse text-left text-sm">
                <thead className="bg-surface-sunken text-text">
                  <tr>
                    {headings.map((heading, cellIndex) => (
                      <th
                        className="border-b border-border-subtle px-3 py-2 font-semibold"
                        key={`${key}-heading-${cellIndex}`}
                        scope="col"
                      >
                        {inlineContent(heading)}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row, rowIndex) => (
                    <tr
                      className="border-b border-border-subtle last:border-b-0"
                      key={`${key}-row-${rowIndex}`}
                    >
                      {headings.map((_, cellIndex) => (
                        <td className="px-3 py-2" key={`${key}-cell-${rowIndex}-${cellIndex}`}>
                          {inlineContent(row[cellIndex] ?? '')}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          );
        }

        if (block.type === 'quote') {
          return (
            <blockquote
              className="m-0 border-l-2 border-border-strong pl-4 text-text-muted"
              key={key}
            >
              {inlineContent(block.text)}
            </blockquote>
          );
        }

        if (block.type === 'rule') {
          return <hr className="m-0 border-0 border-t border-border-subtle" key={key} />;
        }

        return (
          <p className="m-0" key={key}>
            {inlineContent(block.text)}
          </p>
        );
      })}
    </div>
  );
}
