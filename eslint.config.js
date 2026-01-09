const nextCoreWebVitals = require('eslint-config-next/core-web-vitals');

module.exports = [
  ...nextCoreWebVitals,
  {
    rules: {
      'react-hooks/set-state-in-effect': 'off',
    },
  },
];
