/** @type {import('tailwindcss').Config} */
export default {
  theme: {
    extend: {
      colors: {
        sa: {
          green:       '#2C4A3E',
          'green-deep': '#1A2E26',
          'green-ink':  '#14241D',
          cream:        '#E8E6CC',
          'cream-soft': '#F2EFD9',
          'cream-paper':'#EDE9D0',
          'cream-warm': '#DDD9B8',
          strawberry:   '#E04E5C',
          banana:       '#F0C649',
          chocolate:    '#5C3825',
          mango:        '#E58037',
          blueberry:    '#6C4A9E',
          mint:         '#88C0A0',
          coconut:      '#F2EFD9',
          coffee:       '#3F2A1F',
        },
      },
      fontFamily: {
        display: ['"Bagel Fat One"', '"Bowlby One"', 'system-ui', 'sans-serif'],
        body:    ['"DM Sans"', '"Inter"', 'system-ui', 'sans-serif'],
        mono:    ['"DM Mono"', '"JetBrains Mono"', 'ui-monospace', 'monospace'],
        sans:    ['"DM Sans"', '"Inter"', 'system-ui', 'sans-serif'],
      },
      boxShadow: {
        sa: '0 20px 60px -20px rgba(20, 36, 29, 0.35)',
        'sa-sm': '0 6px 16px -8px rgba(20, 36, 29, 0.25)',
      },
      borderRadius: {
        'sa': '20px',
        'sa-lg': '28px',
      },
    },
  },
}
