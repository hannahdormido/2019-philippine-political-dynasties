const autoprefixer = require('autoprefixer');
const bowlServer = require('bowl-server');
const fallbackReader = require('fallback-reader');
const fs = require('fs-extra');
const glob = require('glob');
const io = require('indian-ocean');
const path = require('path');
// eslint-disable-next-line import/no-unresolved
const sassModuleImporter = require('sass-module-importer');

const spelunk = require('spelunk');
const moment = require('moment-timezone');

const gulp = require('gulp');
const plugins = require('gulp-load-plugins')();
const colors = require('ansi-colors');
const log = require('fancy-log');
const notifier = require('node-notifier');

const rollup = require('rollup');
const rollupPlugins = require('rollup-load-plugins')();

const packageJson = require('./package.json');

const isProduction = process.env.NODE_ENV === 'production';
const plumberOpts = { errorHandler: !isProduction };
if (isProduction) notifier.notify = function noop() {}; // noop notify for buildbot

const dest = 'public/';

const ignoreUnderscoresGlob = ['!src/**/_*', '!src/**/_*/**'];
const filesGlob = [
  'src/**',
  '!src/**/*.@(html|aml|ejs)',
  '!src/@(css|js)/**'
].concat(ignoreUnderscoresGlob);
const buildHelpersPath = './src/js/build/buildHelpers';
const caveHelpersPath = './src/js/build/caveHelpers';

const timeAt = /At$/;
function fixTimes(obj) {
  if (!obj) return;

  Object.keys(obj)
    .filter(d => timeAt.exec(d))
    .forEach(d => {
      const t = obj[d];
      /* eslint-disable no-param-reassign */
      if (t.date) {
        const utc = moment.tz(`${t.date} ${t.time || '00:00'}`, t.tz);
        obj[d] = utc;
        obj[`${d}NYC`] = utc
          .tz('America/New_York')
          .format('MMMM D, YYYY, h:mm A z');
      } else {
        obj[d] = null;
      }
      /* eslint-enable no-param-reassign */
    });
}

function errorMessage({ title = 'Error', error = {}, short }) {
  log(colors.red(`${title}:\n${short ? error.message : error}`));
  notifier.notify({
    title: `${packageJson.name} - ${title}`,
    message: error.message
  });
}

const helpers = {};

const config = {
  helpers,
  h: helpers
};

/* Clean task
 * Removes the public directory.
 */
const clean = async () => {
  await fs.remove('public');
  await fs.mkdir('public');
  log(colors.magenta('Deleted'), dest);
};

/**
 * Build the build helpers as they might change
 */
function buildHelpers(done) {
  delete require.cache[require.resolve(buildHelpersPath)];
  // eslint-disable-next-line global-require, import/no-dynamic-require
  Object.assign(helpers, require('borscht'), require(buildHelpersPath));
  done();
}

/**
 * JS build task
 * Uses rollup to compile any js files in src/js (only looks at top-level files).
 */
function js() {
  const bundles = [];

  glob.sync('src/js/*.js').forEach(filePath => {
    const outPath = filePath.replace('src/', dest);

    bundles.push(
      rollup
        .rollup({
          input: filePath,
          plugins: [
            rollupPlugins.json(),
            rollupPlugins.cleanup(),
            rollupPlugins.replace({
              'process.env.NODE_ENV': JSON.stringify('production')
            }),
            rollupPlugins.buble(),
            rollupPlugins.commonjs(),
            rollupPlugins.nodeResolve(),
            rollupPlugins.terser.terser({
              compress: {
                drop_console: isProduction
              }
            })
          ]
        })
        .then(bundle =>
          bundle.write({
            file: outPath,
            format: 'iife',
            name: path.basename(filePath, '.js').replace(/\W/g, ''),
            sourcemap: true
          })
        )
        .then(async () => {
          const stats = await fs.stat(outPath);
          log(
            colors.magenta('Minified and compiled JS to'),
            colors.bold(outPath),
            `(${helpers.formatBytes(stats.size, 2)})`
          );
        })
        .catch(async error => {
          await fs.mkdirp(path.dirname(outPath));
          fs.writeFile(outPath, `console.error(\`${error.id}\n${error}\`)`);
          errorMessage({ title: 'JS Bundling Error', error });
        })
    );
  }, this);

  return Promise.all(bundles);
}

/**
 * CSS build task
 * Compiles any top-level SASS files in src/css.
 */
function css() {
  return gulp
    .src(['src/css/*.s@(a|c)ss'])
    .pipe(
      plugins.plumber({
        errorHandler: isProduction
          ? false
          : function error() {
              this.emit('end');
            }
      })
    )
    .pipe(plugins.sourcemaps.init())
    .pipe(
      plugins
        .sass({
          importer: sassModuleImporter(),
          outputStyle: 'compressed'
        })
        .on('error', error => {
          errorMessage({ title: 'CSS Compilation Error', error, short: true });
        })
    )
    .pipe(plugins.postcss([autoprefixer({ browsers: ['last 4 versions'] })]))
    .pipe(
      plugins.tap(file => {
        log(
          colors.magenta('Minified and complied CSS to'),
          colors.bold(dest + file.relative),
          `(${helpers.formatBytes(file.stat.size, 2)})`
        );
      })
    )
    .pipe(plugins.sourcemaps.write('.'))
    .pipe(
      plugins.tap(file => {
        if (path.extname(file.path) === '.map') {
          log(
            colors.magenta('Compiled CSS sourcemap to'),
            colors.bold(dest + file.relative)
          );
        }
      })
    )
    .pipe(gulp.dest(`${dest}css`));
}

/**
 * Data build task
 * Loads the main config and sets up the data cave
 */
function data() {
  return fallbackReader('config', '.aml,.json')
    .then(d => io.discernParser(d.filePath)(d.contents))
    .then(d => {
      fixTimes(d);
      Object.assign(config, d);

      // eslint-disable-next-line no-use-before-define
      return Promise.all([dataCave(), gDocs()]);
    })
    .catch(error => errorMessage({ title: 'Data Building Error', error }));
}

/**
 * DataCave
 * Recurses the data-cave folder building it into an object
 * see https://github.com/Rich-Harris/spelunk
 */
async function dataCave() {
  return fs
    .exists('src/_cave')
    .then(() =>
      spelunk('src/_cave', {
        exclude: '**/README.md',
        parser: (filePath, d) => io.discernParser(filePath)(d)
      })
    )
    .then(cave => {
      delete require.cache[require.resolve(caveHelpersPath)];
      // eslint-disable-next-line global-require, import/no-dynamic-require
      config.cave = require(caveHelpersPath)({ cave, helpers });
    })
    .catch(error => errorMessage({ title: 'Data Cave Error', error }));
}

/**
 * Google Docs
 * Fetch any Google Docs and parse as data
 */
function gDocs() {
  return new Promise(resolve => {
    resolve();
  });
}

/**
 * Write the config used for each HTML file
 * for ease of debugging
 */
async function writeConfig(filePath, configData) {
  if (isProduction) return;

  const outPath = `${filePath.replace('src/', dest)}.for-reference-only.json`;
  const fileName = path.basename(outPath);
  const out = Object.assign(
    {
      _warning: `${fileName} for reference only, don't use it in your project`
    },
    configData
  );
  delete out.h;
  delete out.helpers;

  await fs.outputJson(outPath, out, { spaces: 2 });
  const stats = await fs.stat(outPath);
  log(
    colors.magenta('Wrote config file for reference'),
    colors.bold(`${dest}${fileName}`),
    `(${helpers.formatBytes(stats.size, 2)})`
  );
}

/**
 * HTML build task
 * Compiles any HTML file in src, looking for a corresponding aml or json file as
 * data input.
 */
function html() {
  return gulp
    .src(['src/**/*.html'].concat(ignoreUnderscoresGlob))
    .pipe(plugins.plumber(plumberOpts))
    .pipe(
      plugins.data(async file => {
        const filePath = file.path.replace(/\.html$/, '');
        const localConfig = await fallbackReader(filePath, '.aml,.json')
          .then(d => io.discernParser(d.filePath)(d.contents))
          .catch(e => {
            if (e.message !== 'No file matched of the extensions specified')
              throw e;
          });

        fixTimes(localConfig);

        const configData = Object.assign({}, config, localConfig);
        writeConfig(filePath, configData);

        return configData;
      })
    )
    .pipe(
      plugins
        .ejs(config)
        .on('error', error =>
          errorMessage({ title: 'HTML Compilation Error', error })
        )
    )
    .pipe(gulp.dest(dest))
    .pipe(
      plugins.tap(file => {
        log(
          colors.magenta('Compiled HTML to'),
          colors.bold(dest + file.relative)
        );
      })
    );
}

/**
 * files copy task
 * Copies unbuilt files in src to public (including dotfiles).
 */
function copy() {
  return gulp
    .src(filesGlob, { dot: true })
    .pipe(gulp.dest(dest))
    .pipe(
      plugins.tap(file => {
        const type = file.isDirectory() ? 'dir' : 'file';
        log(
          colors.magenta(`Copied ${type} from src/${file.relative} to`),
          colors.bold(dest + file.relative)
        );
      })
    );
}

gulp.task(
  'build',
  gulp.series(clean, buildHelpers, data, gulp.parallel(html, css, js, copy))
);

gulp.task('serve', () => {
  bowlServer.start({
    open: false,
    reloadOnRestart: true,
    ui: false,
    snippetOptions: {
      rule: {
        match: /<\/head>/i,
        fn(snippet, match) {
          return `<style>
/* This is injected by gulp during local dev only */
.dvz-content img:not([alt]) {
  outline: 5px dashed #c00;
}
</style>
${snippet}${match}`;
        }
      }
    }
  });
});

gulp.task('watch', () => {
  gulp.watch(filesGlob, copy);
  gulp.watch(['config.@(json|aml)', 'src/_cave/**'], gulp.series(data, html));
  gulp.watch(['src/**/*.@(html|aml|json)', '!src/_cave/**'], html);
  gulp.watch(['src/css/**'], css);
  gulp.watch(['src/js/**', '!src/js/build/**'], js);
  gulp.watch(['src/js/build/**'], gulp.series(buildHelpers, data, html));
});

gulp.task('default', gulp.series('build', gulp.parallel('serve', 'watch')));
