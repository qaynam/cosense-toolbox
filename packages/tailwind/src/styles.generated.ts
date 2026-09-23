/**
 * 生成物。編集しない。
 * packages/style/style.css から `bun run generate` で作る。
 */
import type { CosenseStyles } from './extract'

export const styles: CosenseStyles = {
  root: {
    'font-family':
      'var(--cosense-font, "Open Sans", Helvetica, Arial, "Hiragino Sans", sans-serif)',
    'font-size': 'var(--cosense-font-size, 15px)',
    'line-height': 'var(--cosense-line-height, 1.87)',
    color: 'var(--cosense-text, var(--page-text-color, #4a4a4a))',
    background: 'var(--cosense-bg, var(--page-bg, #fefefe))',
    'text-align': 'left',
    'word-wrap': 'break-word',
  },
  rules: [
    {
      selectors: [
        {
          body: '.title',
          pseudo: '',
        },
      ],
      declarations: {
        margin: '0 0 0.77em',
        'font-size': '1.73em',
        'font-weight': '700',
        'line-height': '1.62',
        color: 'var(--cosense-title, var(--line-title-color, var(--page-text-color, #4a4a4a)))',
      },
    },
    {
      selectors: [
        {
          body: '.line',
          pseudo: '',
        },
      ],
      declarations: {
        position: 'relative',
        'min-height': '1em',
        'font-variant-ligatures': 'no-common-ligatures',
      },
    },
    {
      selectors: [
        {
          body: '.line[data-indent="1"]',
          pseudo: '',
        },
      ],
      declarations: {
        '--cosense-depth': '1',
      },
    },
    {
      selectors: [
        {
          body: '.line[data-indent="2"]',
          pseudo: '',
        },
      ],
      declarations: {
        '--cosense-depth': '2',
      },
    },
    {
      selectors: [
        {
          body: '.line[data-indent="3"]',
          pseudo: '',
        },
      ],
      declarations: {
        '--cosense-depth': '3',
      },
    },
    {
      selectors: [
        {
          body: '.line[data-indent="4"]',
          pseudo: '',
        },
      ],
      declarations: {
        '--cosense-depth': '4',
      },
    },
    {
      selectors: [
        {
          body: '.line[data-indent="5"]',
          pseudo: '',
        },
      ],
      declarations: {
        '--cosense-depth': '5',
      },
    },
    {
      selectors: [
        {
          body: '.line[data-indent="6"]',
          pseudo: '',
        },
      ],
      declarations: {
        '--cosense-depth': '6',
      },
    },
    {
      selectors: [
        {
          body: '.line[data-indent="7"]',
          pseudo: '',
        },
      ],
      declarations: {
        '--cosense-depth': '7',
      },
    },
    {
      selectors: [
        {
          body: '.line[data-indent="8"]',
          pseudo: '',
        },
      ],
      declarations: {
        '--cosense-depth': '8',
      },
    },
    {
      selectors: [
        {
          body: '.line[data-indent="9"]',
          pseudo: '',
        },
      ],
      declarations: {
        '--cosense-depth': '9',
      },
    },
    {
      selectors: [
        {
          body: '.line[data-indent="10"]',
          pseudo: '',
        },
      ],
      declarations: {
        '--cosense-depth': '10',
      },
    },
    {
      selectors: [
        {
          body: '.line[data-indent]',
          pseudo: '',
        },
      ],
      declarations: {
        'padding-left': 'calc(var(--cosense-indent, 1.5em) * var(--cosense-depth, 0))',
      },
    },
    {
      selectors: [
        {
          body: '.line[data-indent]',
          pseudo: '::before',
        },
      ],
      declarations: {
        content: '""',
        position: 'absolute',
        top: '0.7em',
        left: 'calc(var(--cosense-indent, 1.5em) * var(--cosense-depth, 0) - 1.05em)',
        width: '6px',
        height: '6px',
        'border-radius': '50%',
        background: 'var(--cosense-text, var(--page-text-color, #555))',
      },
    },
    {
      selectors: [
        {
          body: '.line:has(> .indent-mark)',
          pseudo: '::before',
        },
      ],
      declarations: {
        content: 'none',
      },
    },
    {
      selectors: [
        {
          body: '.indent-mark',
          pseudo: '',
        },
      ],
      declarations: {
        position: 'absolute',
        left: '0',
        top: '0',
        height: '1em',
        color: 'transparent',
      },
    },
    {
      selectors: [
        {
          body: '.pad',
          pseudo: '',
        },
      ],
      declarations: {
        display: 'inline-block',
        width: 'var(--cosense-indent, 1.5em)',
        height: '1em',
        overflow: 'hidden',
      },
    },
    {
      selectors: [
        {
          body: '.dot',
          pseudo: '',
        },
      ],
      declarations: {
        position: 'absolute',
        right: '0.65em',
        top: '0.7em',
        width: '6px',
        height: '6px',
        'border-radius': '50%',
        background: 'var(--cosense-text, var(--page-text-color, #555))',
      },
    },
    {
      selectors: [
        {
          body: '.link',
          pseudo: '',
        },
        {
          body: '.hashtag',
          pseudo: '',
        },
      ],
      declarations: {
        color: 'var(--cosense-link, var(--page-link-color, #3d72f5))',
        'text-decoration': 'none',
        '-webkit-tap-highlight-color': 'rgba(0, 0, 0, 0.2)',
      },
    },
    {
      selectors: [
        {
          body: '.link:hover',
          pseudo: '',
        },
        {
          body: '.hashtag:hover',
          pseudo: '',
        },
      ],
      declarations: {
        color: 'var(--cosense-link-hover, var(--page-link-hover-color, #0d4ff3))',
      },
    },
    {
      selectors: [
        {
          body: '.code',
          pseudo: '',
        },
        {
          body: '.code-start',
          pseudo: '',
        },
        {
          body: '.code-body',
          pseudo: '',
        },
        {
          body: '.monospace',
          pseudo: '',
        },
      ],
      declarations: {
        'font-family': 'var(--cosense-code-font, ui-monospace, SFMono-Regular, Menlo, monospace)',
        color: 'var(--cosense-code-text, var(--code-color, #342d9c))',
      },
    },
    {
      selectors: [
        {
          body: '.code',
          pseudo: '',
        },
        {
          body: '.monospace',
          pseudo: '',
        },
      ],
      declarations: {
        padding: '0 0.2em',
        'border-radius': '4px',
        'font-size': '90%',
        'word-wrap': 'break-word',
        background: 'var(--cosense-code-bg, var(--code-bg, rgba(0, 0, 0, 0.04)))',
      },
    },
    {
      selectors: [
        {
          body: '.line.code-block > code',
          pseudo: '',
        },
      ],
      declarations: {
        display: 'block',
        'line-height': '1.7em',
        'tab-size': '4',
        background: 'var(--cosense-code-bg, var(--code-bg, rgba(0, 0, 0, 0.04)))',
      },
    },
    {
      selectors: [
        {
          body: '.line.code-block > .code-body',
          pseudo: '',
        },
      ],
      declarations: {
        'margin-left': 'calc(var(--cosense-indent, 1.5em) * -1)',
        'padding-left': 'var(--cosense-indent, 1.5em)',
        'white-space': 'pre-wrap',
      },
    },
    {
      selectors: [
        {
          body: '.code-block-start',
          pseudo: '',
        },
      ],
      declarations: {
        padding: '1px 2px',
        'font-size': '0.95em',
        color: 'var(--cosense-badge-text, #342d9c)',
        background: 'var(--cosense-badge-bg, #ffcfc6)',
      },
    },
    {
      selectors: [
        {
          body: '.line.code-block:not(:has(> .code-start))',
          pseudo: '::before',
        },
      ],
      declarations: {
        content: 'none',
      },
    },
    {
      selectors: [
        {
          body: '.quote',
          pseudo: '',
        },
      ],
      declarations: {
        display: 'block',
        margin: '0',
        'padding-left': '3px',
        'border-left': 'solid 1px #a0a0a0',
        background: 'var(--cosense-quote-bg, var(--quote-bg-color, rgba(0, 0, 0, 0.05)))',
      },
    },
    {
      selectors: [
        {
          body: '.table',
          pseudo: '',
        },
      ],
      declarations: {
        margin: '0',
        'border-collapse': 'collapse',
        'caption-side': 'top',
      },
    },
    {
      selectors: [
        {
          body: '.table caption',
          pseudo: '',
        },
      ],
      declarations: {
        padding: '1px 2px',
        'text-align': 'center',
        'font-size': '0.9em',
        color: 'var(--cosense-badge-text, #342d9c)',
        background: 'var(--cosense-badge-bg, #ffcfc6)',
      },
    },
    {
      selectors: [
        {
          body: '.table td',
          pseudo: '',
        },
      ],
      declarations: {
        padding: '0 2px 0 8px',
        'white-space': 'nowrap',
      },
    },
    {
      selectors: [
        {
          body: '.table td:nth-child(odd)',
          pseudo: '',
        },
      ],
      declarations: {
        background: 'rgba(0, 0, 0, 0.04)',
      },
    },
    {
      selectors: [
        {
          body: '.table td:nth-child(even)',
          pseudo: '',
        },
      ],
      declarations: {
        background: 'rgba(0, 0, 0, 0.06)',
      },
    },
    {
      selectors: [
        {
          body: '.image',
          pseudo: '',
        },
      ],
      declarations: {
        display: 'inline-block',
        'max-width': '100%',
        'max-height': '300px',
        'vertical-align': 'bottom',
      },
    },
    {
      selectors: [
        {
          body: '.image[data-large]',
          pseudo: '',
        },
      ],
      declarations: {
        margin: '3px 0',
        'max-width': '95%',
        'max-height': 'none',
      },
    },
    {
      selectors: [
        {
          body: 'img.icon',
          pseudo: '',
        },
      ],
      declarations: {
        display: 'inline-block',
        position: 'relative',
        top: '-0.3em',
        height: '1.3em',
        'max-width': '100%',
        'vertical-align': 'baseline',
      },
    },
    {
      selectors: [
        {
          body: '.formula',
          pseudo: '',
        },
      ],
      declarations: {
        margin: 'auto 6px',
        'font-family': 'var(--cosense-code-font, ui-monospace, SFMono-Regular, Menlo, monospace)',
        'font-style': 'italic',
      },
    },
    {
      selectors: [
        {
          body: '.decoration[data-size-level="1"]',
          pseudo: '',
        },
      ],
      declarations: {
        'font-size': '1.2em',
      },
    },
    {
      selectors: [
        {
          body: '.decoration[data-size-level="2"]',
          pseudo: '',
        },
      ],
      declarations: {
        'font-size': '1.44em',
      },
    },
    {
      selectors: [
        {
          body: '.decoration[data-size-level="3"]',
          pseudo: '',
        },
      ],
      declarations: {
        'font-size': '1.73em',
      },
    },
    {
      selectors: [
        {
          body: '.decoration[data-size-level="4"]',
          pseudo: '',
        },
      ],
      declarations: {
        'font-size': '2.07em',
      },
    },
    {
      selectors: [
        {
          body: '.decoration[data-size-level]',
          pseudo: '',
        },
      ],
      declarations: {
        display: 'inline-block',
        'line-height': '1.6',
      },
    },
  ],
}
