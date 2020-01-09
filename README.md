<img src="assets/logo.png" width="500" />

# browizard
A javascript browser compatibility checker based on Caniuse data

# How to start
You can run browizard directly in a folder to scan, or provide a remote directory like this:

```
npx browizard --directory|d=<DIRECTORY-PATH>
```

# Thresholds
You can provide a thresholds for any browser listed below. Any provided browser version will be compared to the final report for **less or equal** versions.

The script will return a `0` exit code if succeed, else `1`.

You can pass thresholds like the following (be sure to pass [a valid](https://jsonlint.com/) JSON object **between simple quotes**):
```
npx browizard --threshold|t='{"chrome": "60", "firefox": "55", "edge": "16"}'
```

It will either return a success message like: `Threshold validity check terminated successfully` or a detailed error message like: `Invalid threshold on chrome. Expected: 60 or less, current: 70.` with an exit code `1` (so it can be used in CIs).

# How it works
The script will deep read all of the `.js` files and search for prototypes functions. Then it'll ask the MDN Javascript API for compatibility.

The script outputs something like that:
```
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

# Why you should be aware using it

Browizard (whatever how cool it is) isn't 100% reliable. Two main warning points:

### It only crawls your files and take the **first** entry returned by the MDN API
Example:

In one of your files, there is the `indexOf` function. The scripts find it and checks the MDN API for minimal browser support versions. The dilemma is that there is three types of `indexOf` property:
* for Arrays
* for Strings
* for TypedArrays

But the support version isn't the same for a similar property (for the same browser!), so here's the limit:
* Arrays: Chrome >=1
* Strings: Chrome >=1
* TypedArrays: Chrome >=45

So if the `indexOf` prop scanned by the script in one of your files is for a `TypedArray`, the script will take the `Array` prop and will return a minimal version for Chrome of 1.

In main cases, other properties versions are overriding this error... but it is present!

### It's not possible to threshold versions with special chars
Example:

The MDN API returns minimal browsers versions for a given function. But in some cases (as you can see in the return example above) it will return versions with a special char like `≤`. In this case, it won't be possible to compare the versions given in the threshold with the ones given by the MDN API.
