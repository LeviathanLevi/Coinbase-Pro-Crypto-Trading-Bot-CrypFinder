const CoinbasePro = require("coinbase-pro");
require('dotenv').config()
const {buyPosition, sellPosition} = require("./buyAndSellModule");

const key = `${process.env.API_KEY}`;
const secret = `${process.env.API_SECRET}`;
const passphrase = `${process.env.API_PASSPHRASE}`;
 
//Real environment (uncomment out if using in the real enviornment WARNING: you can lose real money, use at your own risk.):
// const apiURI = "https://api.pro.coinbase.com";
// const websocketURI = "wss://ws-feed.pro.coinbase.com";
// const coinbaseAccountIDSearch = "Cash (USD)"; // work around for different names between sandbox and real env

//Sandbox environment (uncomment out if using the sandbox for testing):
const apiURI = "https://api-public.sandbox.pro.coinbase.com";
const websocketURI = "wss://ws-feed-public.sandbox.pro.coinbase.com";
const coinbaseAccountIDSearch = "USD Wallet"; // work around for different names between sandbox and real env

// The websocket client provides price updates on the product, refer to the docs for more information
const websocket = new CoinbasePro.WebsocketClient(
    ["BTC-USD"],
    websocketURI,
    {
        key,
        secret,
        passphrase,
    },
    { channels: ["ticker"] }
);
 
//authedClient used to make all of the API calls
const authedClient = new CoinbasePro.AuthenticatedClient(
  key,
  secret,
  passphrase,
  apiURI
);

//Global constants, consider tuning these values to optimize the bot's trading: 
const sellPositionProfitDelta = .01; //Minimum amount of money needed to be made before selling position
const sellPositionDelta = .0030; //The amount of change between peak and valley to trigger a sell off
const buyPositionDelta = .0030; //The amount of change between the peak and valley price to trigger a buy in
const orderPriceDelta = .0015; //The amount of extra room to give the sell/buy orders to go through
const takerFee = .005; //Orders that provide liquidity are maker orders, subject to maker fees
const makerFee = .005; //Orders that take liquidity are taker orders, subject to taker fees

//Global variable tracks the currentPrice. Updated by the websocket
let currentPrice;

//Waits to give the websocket time to update
function sleep(ms) {
    return new Promise((resolve) => {
        setTimeout(resolve, ms);
    });
}   

//Activates the websocket to start listening for price changes
function listenForPriceUpdates() {
    websocket.on("message", function(data) {
        if (data.type === "ticker") {
            currentPrice = parseFloat(data.price);
        }
    });

    websocket.on("error", err => {
        console.log(err);
        process.exit(1);
    });
}

/** 
 * Loops forever until the conditions are right to attempt to sell the position
 * 
 * @param {number} btcSize              The amount of BTC being traded with
 * @param {number} lastPeakPrice        Tracks the price highs
 * @param {number} lastValleyPrice      Tracks the price lows
 * @param {string} coinbaseAccountId    The coinbase account ID associated with the API key used for storing a chunk of the profits in coinbase
 * @param {object} updatedPositionInfo  Contains 3 fields, positionExists (bool), positionAcquiredPrice (number), and positionAcquiredCost(number)
*/
async function losePosition(btcSize, lastPeakPrice, lastValleyPrice,  coinbaseAccountId, updatedPositionInfo) {
    while (updatedPositionInfo.positionExists === true) {
        await sleep(2000);

        if (lastPeakPrice < currentPrice) {
            lastPeakPrice = currentPrice;
            lastValleyPrice = currentPrice;
        } else if (lastValleyPrice > currentPrice) {
            lastValleyPrice = currentPrice;

            if ((lastValleyPrice < lastPeakPrice - (lastPeakPrice * sellPositionDelta)) && (lastValleyPrice >= (updatedPositionInfo.positionAcquiredPrice + (updatedPositionInfo.positionAcquiredPrice * (sellPositionProfitDelta + makerFee + takerFee))))) {
                await sellPosition(btcSize, coinbaseAccountId, updatedPositionInfo, currentPrice, orderPriceDelta, authedClient);
            }
        }
    }
}

/** 
 * Loops forever until the conditions are right to attempt to buy the position
 * 
 * @param {number} usdBalance           The amount of USD being traded with
 * @param {number} lastPeakPrice        Tracks the price highs
 * @param {number} lastValleyPrice      Tracks the price lows
 * @param {object} updatedPositionInfo  Contains 3 fields, positionExists (bool), positionAcquiredPrice (number), and positionAcquiredCost(number)
*/
async function gainPosition(usdBalance, lastPeakPrice, lastValleyPrice, updatedPositionInfo) {
    while (updatedPositionInfo.positionExists === false) {
        await sleep(2000);
        
        if (lastPeakPrice < currentPrice) {
            lastPeakPrice = currentPrice;
            if (currentPrice > (lastValleyPrice + (lastValleyPrice * buyPositionDelta))) {
                await buyPosition(usdBalance, updatedPositionInfo, takerFee, currentPrice, orderPriceDelta, authedClient);
            }
        } else  if (lastValleyPrice > currentPrice) {
            lastPeakPrice = currentPrice;
            lastValleyPrice = currentPrice;
        }
    }
}

/** 
 * Acquires some account ID information to be used for storing and retrieving information
*/
async function getAccountIDs() {
    let accountObject = {};

    const coinBaseAccounts = await authedClient.getCoinbaseAccounts();
    
    for (let i = 0; i < coinBaseAccounts.length; ++i) {
        if (coinBaseAccounts[i].name === coinbaseAccountIDSearch) {
            accountObject.coinbaseAccountId = coinBaseAccounts[i].id;
        }
    }

    const accounts = await authedClient.getAccounts();

    for (let i = 0; i < accounts.length; ++i) {
        if (accounts[i].currency === "USD") {
            accountObject.usdAccountId = accounts[i].id;
        } else if (accounts[i].currency === "BTC") {
            accountObject.btcAccountId = accounts[i].id;
        }
    }

    return accountObject;
}

/*
*   Starts the bot trading
*   Entry point of program
*/
async function mainLoop() {
    let accountIDs = {};
    let lastPeakPrice;
    let lastValleyPrice;
    let updatedPositionInfo = {
        positionExists: false,
    };

    try {
        //Retrieve account IDs:
        accountIDs = await getAccountIDs();
    } catch (err) {
        console.log("Could not retrieve account IDs");
        console.log(err);
        process.exit(1);
    }

    //activate websocket for price data:
    listenForPriceUpdates();
    await sleep(5000);

    // eslint-disable-next-line no-constant-condition
    while (true) {
        if (updatedPositionInfo.positionExists) {
            try {
                await sleep(2000);
                const btcAccount = await authedClient.getAccount(accountIDs.btcAccountId);

                if (btcAccount.available > 0) {
                    lastPeakPrice = currentPrice;
                    lastValleyPrice = currentPrice;
                    await losePosition(parseFloat(btcAccount.available), lastPeakPrice, lastValleyPrice, accountIDs.coinbaseAccountId, updatedPositionInfo);
                } else {
                    throw new Error("Error, there is no btc balance available for use. Terminating program.");
                }

            } catch (err) {
                console.log(err);
                process.exit(1);
            }
        } else {
            try {
                await sleep(2000);
                const usdAccount = await authedClient.getAccount(accountIDs.usdAccountId);

                if (usdAccount.available > 0) {
                    lastPeakPrice = currentPrice;
                    lastValleyPrice = currentPrice;
                    await gainPosition(parseFloat(usdAccount.available), lastPeakPrice, lastValleyPrice, updatedPositionInfo);
                } else {
                    throw new Error("Error, there is no available usd balance. Terminating program.");
                }

            } catch (err) {
                console.log(err);
                process.exit(1);
            }
        }
    }
}

mainLoop(); //begin