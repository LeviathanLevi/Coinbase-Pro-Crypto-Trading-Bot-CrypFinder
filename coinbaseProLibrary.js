/*
*   The official coinbase-pro library (https://www.npmjs.com/package/coinbase-pro) has been deprecated as of January 16th, 2020. 
*   The coinbase-pro library still works but it doesn't support all of the API endpoints being used by this project. As a work 
*   around, this file will create a library that supports those other methods needed for this bot to run. If this library gets 
*   enough attention and development then it could be spun off as it's own project, since as of right now there's no NodeJS 
*   library for the Coinbase Pro API.
*/

const crypto = require("crypto");
const axios = require("axios");

/**
 * Class: 
 */
class coinbaseProLib {
    /**
     * Summary: constructs an instance of this class that can be used to make the API endpoint calls
     * 
     * @param {string} apiKey 
     * @param {string} apiSecret 
     * @param {string} apiPassphrase 
     * @param {string} apiURI 
     */
    constructor(apiKey, apiSecret, apiPassphrase, apiURI) {
        this.apiKey = apiKey;
        this.apiSecret = apiSecret;
        this.apiPassphrase = apiPassphrase;
        this.apiURI = apiURI;
    }

    /**
     * 
     */
    async signMessage(method, requestPath, body) {
        if (method == null || requestPath == null) {
            throw new Error("Error in signMessage method, method or requestPath is null!");
        }

        let timestamp = Date.now() / 1000;
        let what;

        if (body == null) {
            what = timestamp + method + requestPath;
        } else {
            what = timestamp + method + requestPath + JSON.stringify(body);
        }

        console.log(what);

        // decode the base64 secret
        let key = Buffer.from(this.apiSecret, 'base64');

        // create a sha256 hmac with the secret
        let hmac = crypto.createHmac('sha256', key);

        // sign the require message with the hmac
        // and finally base64 encode the result
        let result = hmac.update(what).digest('base64');

        console.log(result);

        return result;
    }

    /**
     * 
     */
    async getProfiles() {
        let method = "GET";
        let requestPath = "/profiles";
        let body = null;
        let timestamp = Date.now() / 1000;

        let sign = await this.signMessage(method, requestPath, body);

        let headers = {
            "CB-ACCESS-KEY": this.apiKey,
            "CB-ACCESS-SIGN": sign,
            "CB-ACCESS-TIMESTAMP": timestamp,
            "CB-ACCESS-PASSPHRASE": this.apiPassphrase
        };

        const fullpath = this.apiURI + requestPath;

        console.log("HERE: " + JSON.stringify(headers) + "fullpath: " + fullpath);

        const result = await axios.get(fullpath, {headers});

        console.log(result);

        return result;
    }

    /**
     * 
     * 
     * @param {string} recieverProfileAddress 
     * @param {string} currency 
     * @param {string} amount 
     */
    async profileTransfer(recieverProfileAddress, currency, amount) {

    }



}

module.exports = coinbaseProLib;