"use strict";

const shell = require('shelljs');
const chalk = require('chalk');

const PACKAGE_NAME = `browizard`;
const NPM_DIR = `dist`;

shell.echo(`Start building...`);

shell.rm(`-Rf`, `${NPM_DIR}/*`);
shell.echo(shell.pwd());

/* TSLint with Codelyzer */
// https://github.com/palantir/tslint/blob/master/src/configs/recommended.ts
// https://github.com/mgechev/codelyzer
shell.echo(`Start TSLint`);
shell.exec(`npm run lint-ts`);
shell.echo(chalk.green(`TSLint completed`));

/* Webpack compilation */
shell.echo(`Start Webpack compilation`);
if (shell.exec(`npm run build-ts`).code !== 0) {
    shell.echo(chalk.red(`Error: Webpack compilation failed`));
    shell.exit(1);
}
shell.echo(chalk.green(`Webpack compilation completed`));

// TODO: check if it's useful to minify prod-transpiled TS
// shell.echo(`Minifying`);
// shell.exec(`uglifyjs ${NPM_DIR}/${PACKAGE_NAME}.js -c --comments -o ${NPM_DIR}/${PACKAGE_NAME}.min.js`);
// shell.echo(chalk.green(`Minifying completed`));

shell.rm(`-Rf`, `${NPM_DIR}/node_modules`);

shell.cp(`-Rf`, [`package.json`, `LICENSE`, `README.md`, `bin`], `${NPM_DIR}`);

shell.echo(chalk.green(`End building`));
