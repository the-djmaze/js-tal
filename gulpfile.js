const gulp = require('gulp'),
	eol = require('gulp-eol'),
	eslint = require('gulp-eslint'),
	cache = require('gulp-cached'),
	del = require('del'),
	rollup2 = require('gulp-rollup-2'),
	includePaths = require('rollup-plugin-includepaths');

const rollupJS = (inputFile) =>
	rollup2.src({
		input: 'src/' + inputFile,
		output: [
			{file: 'build/' + inputFile, format: 'iife'}
		],
		plugins: [
			includePaths({
				include: {},
				paths: ['src'],
				external: [],
				extensions: ['.js']
			})
		]
	});

const jsLint = () =>
	gulp
		.src('src/**/*.js')
		.pipe(cache('eslint'))
		.pipe(eslint())
		.pipe(eslint.format())
		.pipe(eslint.failAfterError());

const jsTal = async () =>
	(await rollupJS('tal.js'))
//		.pipe(sourcemaps.write('.'))
		.pipe(eol('\n', true))
		.pipe(gulp.dest('build/'));

const build = gulp.series(
	() => del('build/*.js'),
	jsLint,
	jsTal
);

exports.build = build;
exports.default = build;
