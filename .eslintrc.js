module.exports = {
	parser: '@babel/eslint-parser',
//	extends: ['eslint:recommended', 'plugin:prettier/recommended'],
	extends: ['eslint:recommended'],
	parserOptions: {
		requireConfigFile: false,
		babelOptions: {
			babelrc: false,
			configFile: false,
			// your babel options
			presets: ["@babel/preset-env"],
		},
		ecmaVersion: 6,
		sourceType: 'module'
	},
	env: {
		node: true,
		browser: true,
		es2020: true
	},
	globals: {
		'TAL': "readonly"
	},
	// http://eslint.org/docs/rules/
	rules: {
		'no-cond-assign': 0,
		// plugins
		'no-mixed-spaces-and-tabs': 'off',
		'max-len': [
			'error',
			120,
			2,
			{
				ignoreComments: true,
				ignoreUrls: true,
				ignoreTrailingComments: true,
				ignorePattern: '(^\\s*(const|let|var)\\s.+=\\s*require\\s*\\(|^import\\s.+\\sfrom\\s.+;$)'
			}
		],
		'no-constant-condition': ["error", { "checkLoops": false }]
	}
};
