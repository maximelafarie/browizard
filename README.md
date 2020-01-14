<img src="assets/logo.png" width="500" />

[![Build Status](https://travis-ci.org/maximelafarie/browizard.svg?branch=master)](https://travis-ci.org/maximelafarie/browizard)
[![npm version](https://badge.fury.io/js/browizard.svg)](https://badge.fury.io/js/browizard)
[![npm downloads](https://img.shields.io/npm/dm/browizard.svg)](https://npmjs.org/browizard)

# browizard
A javascript browser compatibility checker based on [MDN API](https://developer.mozilla.org/) data

# Install
It's better to install browizard globally on your machine:

```bash
npm i -g browizard
```

# How to use
You can run browizard directly in a folder to scan, or provide a remote directory like this:

```bash
browizard --directory|d=<DIRECTORY-PATH>
```

# Thresholds
You can provide a thresholds for any browser listed below. Any provided browser version will be compared to the final report for **less or equal** versions.

The script will return a `0` exit code if succeed, else `1`.

You can pass thresholds like the following (be sure to pass [a valid](https://jsonlint.com/) JSON object **between simple quotes**):

```bash
browizard --threshold|t='{"chrome": "60", "firefox": "55", "edge": "16"}'
```

It will either return a success message like: `Threshold validity check terminated successfully` or a detailed error message like: `Invalid threshold on chrome. Expected: 60 or less, current: 70.` with an exit code `1` (so it can be used in CIs).

# Ignoring files
Sometimes, you simply don't want to check some files. Either because it's not relevant for your test or it simply makes the script fail...

In order to prevent some files to be checked, you can use the `--e` or `--exclude` option. It takes a RegExp string and will try to match the files with `i` flag.

The "file contains" example:
```bash
browizard --d=dist/js --e|exclude='chunk|another-file'
```

The "CSS and SCSS exclusion" example (even though the script already ignore them but **will support them in the future**)
```bash
browizard --d=dist/js --e|exclude='([a-zA-Z0-9\s_\\.\-\(\):])+(.css|.scss)$'
```

# Increase buffer chunk size
If you're scanning files with very long strings (more that 65000 chars approx.), the script may fail. It's due to the default size of a `readStream` chunk defined in NodeJS. In order to fix that, you can use the `--b` or `--buffersize` option. `String` and `Number` accepted.

Example: 
```bash
browizard --d=dist/js --b|buffersize=$(( 128 * 1024 ))
```

or directly: 
```bash
browizard --d=dist/js --b|buffersize='131072'
```

# How it works
The script will deep read all of the `.js` files and search for prototypes functions. Then it'll ask the MDN Javascript API for compatibility.

The script outputs something like that:
```bash
Read entire file polyfills-es2015.234d8bd921252538356d.js ✅
Read entire file runtime-es5.465c2333d355155ec5f3.js ✅
Read entire file runtime-es2015.703a23e48ad83c851e49.js ✅
Read entire file polyfills-es5.27440667c81456d005bd.js ✅
Read entire file scripts.cceedd438f7a65227341.js ✅
Read entire file main-es2015.9f55004bbfcda26c5ba0.js ✅
Read entire file main-es5.dc80fe38ce5fdad7a196.js ✅
Minimal supported versions for scanned files are: {
  chrome: '70',
  chrome_android: '70',
  edge: '18',
  firefox: '63',
  firefox_android: '63',
  ie: '9',
  nodejs: true,
  opera: '57',
  opera_android: '49',
  safari: '9',
  safari_ios: '9',
  samsunginternet_android: '8.0',
  webview_android: '≤37'
}
Checking threshold validity...
Threshold validity check terminated successfully
Process exited with code:  0
Execution time: 8423ms
```
You've got:
* The filename after it has been completely scanned (and the read status)
* The minimal supported version for each browser
* The threshold check status (if option provided to the command)
* The process exit code (0 = success | > 0 = error)
* The script execution time

# Troubleshooting & user notice

## The "error while reading" error
Sometimes, you can fall into this issue:

```bash
Error while reading file chunk-vendors.63f8bc84.js ❌
 SyntaxError: Unexpected token (1:5358)
    at Parser.pp$4.raise (/Users/maximelafarie2/dev/github/repos/browser-spector/node_modules/acorn/dist/acorn.js:2836:15)
    at Parser.pp.unexpected (/Users/maximelafarie2/dev/github/repos/browser-spector/node_modules/acorn/dist/acorn.js:689:10)
    at Parser.pp$3.parseExprAtom (/Users/maximelafarie2/dev/github/repos/browser-spector/node_modules/acorn/dist/acorn.js:2260:12)
    at Parser.pp$3.parseExprSubscripts (/Users/maximelafarie2/dev/github/repos/browser-spector/node_modules/acorn/dist/acorn.js:2089:2)
    at Parser.pp$3.parseMaybeUnary (/Users/maximelafarie2/dev/github/repos/browser-spector/node_modules/acorn/dist/acorn.js:2066:19)
    at Parser.pp$3.parseExprOps (/Users/maximelafarie2/dev/github/repos/browser-spector/node_modules/acorn/dist/acorn.js:2010:21)
    at Parser.pp$3.parseMaybeConditional (/Users/maximelafarie2/dev/github/repos/browser-spector/node_modules/acorn/dist/acorn.js:1993)
    at Parser.pp$3.parseMaybeAssign (/Users/maximelafarie2/dev/github/repos/browser-spector/node_modules/acorn/dist/acorn.js:1968:21)
    at Parser.pp$3.parseExpression (/Users/maximelafarie2/dev/github/repos/browser-spector/node_modules/acorn/dist/acorn.js:1933:21)
    at Parser.pp$1.parseStatement (/Users/maximelafarie2/dev/github/repos/browser-spector/node_modules/acorn/dist/acorn.js:877:47) {
  pos: 5358,
  loc: Position { line: 1, column: 5358 },
  raisedAt: 5358
}
[■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■] | about.2868ee64.js ✅ | 11/0
[■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■] | app.d0da9fcf.js ✅ | 183/0
[                                        ] | {filename} | 0/100
```

After some investigations, we found out that it's caused by **newlines** in files. It seems that the `chunk-vendor` file of VueJS build match this case.

So in order to let the script watch your transpiled files (`about`, `app`, ...) you can refer to the [Ignoring files section](#ignoring-files) of this readme.

You'll end up with something like: `browizard --d=dist/js --e='chunk'`. And then the script will skip all files matching your exclusion rule.

## Why you should be aware using this script

Browizard (whatever how cool it is) isn't 100% reliable. Two main warning points:

### It only crawls your files and take the **first** entry returned by the MDN API
Example:

In one of your files, there is the `indexOf` function. The scripts find it and checks the MDN API for minimal browser support versions. The dilemma is that there is three types of `indexOf` property:
* for `Arrays`
* for `Strings`
* for `TypedArrays`

But the support version isn't the same for a similar property (for the same browser!), so here's the limit:
* `Arrays`: `Chrome >=1`
* `Strings`: `Chrome >=1`
* `TypedArrays`: `Chrome >=45`

So if the `indexOf` prop scanned by the script in one of your files is for a `TypedArray`, the script will take the `Array` prop and will return a minimal version for Chrome of 1.

In main cases, other properties versions are overriding this error... but it is present!

**So be careful if you want to break your CI execution if the threshold doesn't match the one you provided. It may be better using it for retriving minimal supported versions for your project.**
