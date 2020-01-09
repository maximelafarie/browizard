import acorn = require("acorn");
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

// Script time execution measurement
const start = new Date();

// Retrieve arguments passed to the script
const givenArgs = getArgs();
const _PATH = givenArgs.d || givenArgs.directory || undefined;
const _SILENT = givenArgs.s || givenArgs.silent || undefined;
const _THRESHOLD = givenArgs.t || givenArgs.threshold || undefined;

let report: any = null;
const exploredProtos: string[] = [];

// joining path of directory
const directoryPath = path.join(process.cwd(), _PATH);

const isSilent = !!_SILENT && _SILENT !== 'false';

// Messy way to disable logs if silent mode activated
if (isSilent) {
    console.log = () => { return; };
}

// Little sexy branding log ;)
// tslint:disable:no-trailing-whitespace
console.log(`
▄▄▄▄· ▄▄▄        ▄▄▌ ▐ ▄▌▪  ·▄▄▄▄• ▄▄▄· ▄▄▄  ·▄▄▄▄  
▐█ ▀█▪▀▄ █·▪     ██· █▌▐███ ▪▀·.█▌▐█ ▀█ ▀▄ █·██▪ ██ 
▐█▀▀█▄▐▀▀▄  ▄█▀▄ ██▪▐█▐▐▌▐█·▄█▀▀▀•▄█▀▀█ ▐▀▀▄ ▐█· ▐█▌
██▄▪▐█▐█•█▌▐█▌.▐▌▐█▌██▐█▌▐█▌█▌▪▄█▀▐█ ▪▐▌▐█•█▌██. ██ 
·▀▀▀▀ .▀  ▀ ▀█▄▀▪ ▀▀▀▀ ▀▪▀▀▀·▀▀▀ • ▀  ▀ .▀  ▀▀▀▀▀▀• 
`);
// tslint:enable:no-trailing-whitespace

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

// // create new progress bar
// const b1 = new _progress.SingleBar({}, _progress.Presets.shades_classic);

// // // initialize the bar - (total, starting value)
// b1.start(100, 0);

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

        const filesToCheck = files.filter((file) =>
            !fs.lstatSync(`${_PATH}/${file}`).isDirectory() && file.match(new RegExp(/([a-zA-Z0-9\s_\\.\-\(\):])+(.js|.jsx)$/, 'i')));

        // listing all files using forEach
        filesToCheck.forEach((file, index) => {
            // Do whatever you want to do with the file

            let lineNr = 0;
            const filePath = `${_PATH}/${file}`;

            const s = fs.createReadStream(filePath)
                .pipe(es.split())
                .pipe(es.mapSync((line: any) => {
                    // pause the readstream
                    s.pause();

                    lineNr += 1;

                    // Check supported browser versions for each prototypes
                    const protos = getFunctionNames(line);

                    protos.forEach((protoName) => {
                        // If proto not already analyzed
                        if (!exploredProtos.includes(protoName)) {
                            exploredProtos.push(protoName); // Add explored proto to not analyze it twice
                            const obj: any = getFromMDN(protoName);

                            if (!!obj) {
                                // Format object before process
                                Object.keys(obj).forEach((key: string) => {
                                    if (_.has(obj[key], 'version_added')) {
                                        obj[key] = obj[key].version_added;
                                    } else {
                                        delete obj[key];
                                    }
                                });

                                // Add versions to report
                                if (_.isNil(report)) {
                                    report = obj;
                                } else {
                                    Object.keys(report).forEach((key: string) => {
                                        if (obj[key] > report[key]) {
                                            report[key] = obj[key];
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

                    // b1.update(((index+1) / filesToCheck.length) * 100);
                })
                    .on('error', (error) => {
                        console.log(`Error while reading file ${file} ❌`, error);
                    })
                    .on('end', () => {
                        console.log(`Read entire file ${file} ✅`);
                    })
                );

            // Stop the loader
            // b1.stop();
        });
    });
};

process.on('beforeExit', (code) => {
    // stop the bar
    // bar1.stop();

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
    console.info('Execution time: %dms', end);
});

module.exports = wizard();
