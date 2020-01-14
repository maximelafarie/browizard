import acorn = require('acorn');
import chalk = require('chalk');
import es = require('event-stream');
import fs = require('fs');
import bcd = require('mdn-browser-compat-data');
import path = require('path');
import util = require('util');

import * as _ from 'lodash';

// Extension to acorn
// (no definition type file: https://github.com/acornjs/acorn/issues/814)
// tslint:disable-next-line:no-var-require
const walk = require('acorn-walk');

// Loader imports
const progress = require('cli-progress');
const colors = require('colors');

// Create new progress bars
const multibar = new progress.MultiBar({
    format: '[{bar}] | {filename} | {value}/{total}',
    fps: 5,
    stopOnComplete: true
}, progress.Presets.rect);

// Semver comparator
// cmp(a,b) : If the semver string a is greater than b, return 1. If the semver string b is
// greater than a, return -1. If a equals b, return 0;
const cmp = require('semver-compare');

// Script time execution measurement
const start = new Date();

// Retrieve arguments passed to the script
const givenArgs = getArgs();
const _SILENT = givenArgs.s || givenArgs.silent || undefined;
const _PATH = givenArgs.d || givenArgs.directory || undefined;
const _EXCLUDE = givenArgs.e || givenArgs.exclude || undefined;
const _THRESHOLD = givenArgs.t || givenArgs.threshold || undefined;
const _BUFFERSIZE = givenArgs.b || givenArgs.buffersize || undefined;

let report: any = null;
const exploredProtos: string[] = [];

// Joining path of directory
const directoryPath = path.join(process.cwd(), _PATH);

const isSilent = !!_SILENT && _SILENT !== 'false';

// Size of a chunk for readStream
// Default: 16384 (16kb), or 16 for objectMode streams
// documentation: https://nodejs.org/api/stream.html#stream_constructor_new_stream_writable_options
const bufferSize = !isNaN(parseInt(_BUFFERSIZE, 10)) ? parseInt(_BUFFERSIZE, 10) : null;

// Given RegExp for file exclusion
const fileExclusionRegExp: string = _EXCLUDE;

// Messy way to disable logs if silent mode activated
if (isSilent) {
    console.log = () => { return; };
}

// Little sexy branding log ;)
console.log(`
▄▄▄▄· ▄▄▄        ▄▄▌ ▐ ▄▌▪  ·▄▄▄▄• ▄▄▄· ▄▄▄  ·▄▄▄▄
▐█ ▀█▪▀▄ █·▪     ██· █▌▐███ ▪▀·.█▌▐█ ▀█ ▀▄ █·██▪ ██
▐█▀▀█▄▐▀▀▄  ▄█▀▄ ██▪▐█▐▐▌▐█·▄█▀▀▀•▄█▀▀█ ▐▀▀▄ ▐█· ▐█▌
██▄▪▐█▐█•█▌▐█▌.▐▌▐█▌██▐█▌▐█▌█▌▪▄█▀▐█ ▪▐▌▐█•█▌██. ██
·▀▀▀▀ .▀  ▀ ▀█▄▀▪ ▀▀▀▀ ▀▪▀▀▀·▀▀▀ • ▀  ▀ .▀  ▀▀▀▀▀▀•
`);

// For debug purposes. Allow logs to display full data
util.inspect.defaultOptions.maxArrayLength = null;

function getFunctionNames(codeString: string) {
    const names: string[] = [];

    walk.full(acorn.parse(codeString), (node: any) => {
        if (node.property && node.property.type && node.property.type === 'Identifier') {
            if (!!node.property && node.property.name) {
                names.push(node.property.name);
            }
        }
    });

    return names;
}

function getFromMDN(proto: string): object {
    let res = null;

    _.each(bcd.javascript, (v, k) => {
        _.each(bcd.javascript[k], (val, index) => {
            const occurrence = _.find(val[proto]);
            if (!!occurrence) {
                res = _.get(occurrence, 'support');
            }
        });
    });

    return res;
}

// Get comparison between result and given threshold
function thresholdIsValid(base: any, threshold: any): boolean {

    if (_.isObject(base) && _.isObject(threshold)) {

        for (const key in threshold) {
            if (!_.isNil(_.get(base, key))) {
                if (_.get(base, key) > _.get(threshold, key)) {
                    console.log(chalk.red(`Invalid threshold on ${key}. Expected: ${_.get(threshold, key)} or less, current: ${_.get(base, key)}.`));
                    return false;
                }
            }
        }

        return true;
    }
    return false;
}

function getArgs() {
    const args: any = {};
    process.argv
        .slice(2, process.argv.length)
        .forEach((arg) => {
            if (arg.slice(0, 2) === '--') {
                // long arg
                const longArg = arg.split('=');
                const longArgFlag = longArg[0].slice(2, longArg[0].length);
                const longArgValue = longArg.length > 1 ? longArg[1] : true;
                args[longArgFlag] = longArgValue;
            } else if (arg[0] === '-') {
                // flags
                const flags = arg.slice(1, arg.length).split('');
                flags.forEach((flag) => {
                    args[flag] = true;
                });
            }
        });

    return args;
}

// passsing directoryPath and callback function
const wizard = () => {
    fs.readdir(directoryPath, (err, files) => {
        // handling error
        if (err) {
            return console.log('Unable to scan directory: ' + err);
        }

        let filesToCheck = files.filter((file) =>
            !fs.lstatSync(`${_PATH}/${file}`).isDirectory() &&
            file.match(new RegExp(/([a-zA-Z0-9\s_\\.\-\(\):])+(.js|.jsx)$/, 'i')));

        // Do additional filtering if file exclusion provided
        if (!!fileExclusionRegExp && fileExclusionRegExp.length) {
            filesToCheck = filesToCheck.filter((file) => !file.match(new RegExp(fileExclusionRegExp, 'i')));
        }

        // initialize progress bars - (total, starting value)
        const progressBars = <any>[];

        // listing all files using forEach
        filesToCheck.forEach((file, index) => {
            // Do whatever you want to do with the file
            const b = multibar.create(100, 0);
            progressBars.push(b);

            let lineNr = 0;
            const filePath = `${_PATH}/${file}`;

            const s = fs.createReadStream(filePath, { highWaterMark: bufferSize })
                .pipe(es.split())
                .pipe(es.mapSync((line: any) => {
                    // pause the readstream
                    s.pause();

                    lineNr += 1;

                    // Check supported browser versions for each prototypes
                    // Additionally removing newlines from content

                    // Below line is a WIP for read file content in one line
                    // const protos = getFunctionNames(line.toString().replace(/^[\r\n]+|[\r\n]+$/g, ''));
                    const protos = getFunctionNames(line);

                    // Set total protos on the file
                    progressBars[index].setTotal(protos.length);

                    protos.forEach((protoName, protoIndex) => {
                        // Increment progress bar value
                        progressBars[index].update(protoIndex + 1, { filename: file });

                        // If proto not already analyzed
                        if (!exploredProtos.includes(protoName)) {
                            exploredProtos.push(protoName); // Add explored proto to not analyze it twice
                            const obj: any = getFromMDN(protoName);

                            if (!!obj) {
                                // Format object before process
                                Object.keys(obj).forEach((key: string) => {
                                    if (_.has(obj[key], 'version_removed') || _.has(obj[key], 'version_added')) {
                                        obj[key] = obj[key].version_removed || obj[key].version_added;
                                    } else {
                                        delete obj[key];
                                    }
                                });

                                // Add versions to report
                                if (_.isNil(report)) {
                                    report = obj;
                                } else {

                                    Object.keys(report).forEach((key: string) => {

                                        if (_.isString(obj[key]) && _.isString(report[key])) {
                                            // If value is a valid semver

                                            // Remove potential invalid leading char like `≤37`
                                            if (isNaN(parseInt(obj[key].charAt(0), 10))) {
                                                obj[key] = obj[key].substring(1);
                                            }

                                            if (cmp(obj[key], report[key]) === 1) {
                                                report[key] = obj[key];
                                            }
                                        } else {
                                            // If value is boolean
                                            if (obj[key] === false) {
                                                report[key] = obj[key];
                                            } else {
                                                if (_.isNil(report[key])) {
                                                    report[key] = obj[key];
                                                }
                                            }
                                        }

                                    });
                                }
                            }
                        }
                    });

                    // process line here and call s.resume() when rdy
                    // function below was for logging memory usage
                    // logMemoryUsage(lineNr);

                    // resume the readstream, possibly from a callback
                    s.resume();
                })
                    .on('error', (error) => {
                        console.log('\n' + `Error while reading file ${file} ❌` + '\n', error);
                    })
                    .on('end', () => {
                        progressBars[index].update(progressBars[index].value, { filename: file + ' ✅' });
                    })
                );
        });
    });
};

process.on('beforeExit', (code) => {
    console.log('Minimal supported versions for scanned files are:', report);

    if (!!_THRESHOLD) {
        console.log('Checking threshold validity...');
        if (!thresholdIsValid(report, JSON.parse(_THRESHOLD))) {
            process.exit(1);
        } else {
            console.log(chalk.green('Threshold validity check terminated successfully'));
        }
    }

    const end = (new Date() as any) - (start as any);
    console.log('Process exited with code: ', code);
    console.log('Execution time: %dms', end);
});

module.exports = wizard();
