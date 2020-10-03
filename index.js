const CoinbasePro = require("coinbase-pro");
require('dotenv').config()
const {buyPosition, sellPosition} = require("./buyAndSell");
const coinbaseProLib = require("./coinbaseProLibrary");

const key = `${process.env.API_KEY}`;
const secret = `${process.env.API_SECRET}`;
const passphrase = `${process.env.API_PASSPHRASE}`;
 
//******************** Configure these values before running the program ******************************************

//Real environment (uncomment out if using in the real enviornment WARNING: you can lose real money, use at your own risk):
// const apiURI = "https://api.pro.coinbase.com";
// const websocketURI = "wss://ws-feed.pro.coinbase.com";

//Sandbox environment (uncomment out if using the sandbox for testing):
const apiURI = "https://api-public.sandbox.pro.coinbase.com";
const websocketURI = "wss://ws-feed-public.sandbox.pro.coinbase.com";

//Global constants, consider tuning these values to optimize the bot's trading: 
const sellPositionProfitDelta = .01; //Minimum amount of money needed to be made before selling position
const sellPositionDelta = .0030; //The amount of change between peak and valley to trigger a sell off
const buyPositionDelta = .0030; //The amount of change between the peak and valley price to trigger a buy in
const orderPriceDelta = .0015; //The amount of extra room to give the sell/buy orders to go through
const takerFee = .005; //Orders that provide liquidity are maker orders, subject to maker fees
const makerFee = .005; //Orders that take liquidity are taker orders, subject to taker fees

//Product pair pieces the two halves of coinbase product (examples of product pairs: BTC-USD, DASH-BTC, ETH-USDC), example of pieces: XRP-BTC product1 = XRP, product2 = USD: 
const product1 = "BTC";
const product2 = "USD";
const productPair = product1 + "-" + product2;

//Coinbase portfolios (profiles):
const tradingProfileName = "BTC trader"; //This is the name of the profile you want the bot to trade in
const depositProfileName = "Profit savings"; //This is the name of the profile you want to deposit some profits to

//*****************************************************************************************************************

// The websocket client provides price updates on the product, refer to the docs for more information
const websocket = new CoinbasePro.WebsocketClient(
    [productPair],
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

//Custom coinbase library creation:
const coinbaseLibObject = new coinbaseProLib(key, secret, passphrase, apiURI);

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
 * @param {object} accountIds           The coinbase account ID associated with the API key used for storing a chunk of the profits in coinbase
 * @param {object} updatedPositionInfo  Contains 3 fields, positionExists (bool), positionAcquiredPrice (number), and positionAcquiredCost(number)
*/
async function losePosition(btcSize, lastPeakPrice, lastValleyPrice,  accountIds, updatedPositionInfo) {
    while (updatedPositionInfo.positionExists === true) {
        await sleep(2000);

        if (lastPeakPrice < currentPrice) {
            lastPeakPrice = currentPrice;
            lastValleyPrice = currentPrice;
        } else if (lastValleyPrice > currentPrice) {
            lastValleyPrice = currentPrice;

            if ((lastValleyPrice < lastPeakPrice - (lastPeakPrice * sellPositionDelta)) && (lastValleyPrice >= (updatedPositionInfo.positionAcquiredPrice + (updatedPositionInfo.positionAcquiredPrice * (sellPositionProfitDelta + makerFee + takerFee))))) {
                console.log("Attempting to sell position...");
                await sellPosition(btcSize, accountIds, updatedPositionInfo, currentPrice, orderPriceDelta, authedClient, coinbaseLibObject, productPair, product2);
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
                console.log("Attempting to buy position...");
                await buyPosition(usdBalance, updatedPositionInfo, takerFee, currentPrice, orderPriceDelta, authedClient, productPair);
            }
        } else  if (lastValleyPrice > currentPrice) {
            lastPeakPrice = currentPrice;
            lastValleyPrice = currentPrice;
        }
    }
}

/** 
 * Acquires some account ID information to be used for storing and retrieving information
 * and depositing funds after a sell.
*/
async function getAccountIDs() {
    let accountObject = {};
    
    //Gets the account IDs for the product pairs in the portfolio
    const accounts = await authedClient.getAccounts();

    for (let i = 0; i < accounts.length; ++i) {
        if (accounts[i].currency === product1) {
            accountObject.product1AccountID = accounts[i].id;
        } else if (accounts[i].currency === product2) {
            accountObject.product2AccountID = accounts[i].id;
        }
    }
    
    //Gets all the profiles belonging to the user and matches the deposit and trading profile IDs
    const profiles = await coinbaseLibObject.getProfiles();

    for (let i = 0; i < profiles.length; ++i) {
        if (profiles[i].name === depositProfileName) {
            accountObject.depositProfileID = profiles[i].id;
        } else if (profiles[i].name === tradingProfileName) {
            accountObject.tradeProfileID = profiles[i].id;
        }
    }

    return accountObject;
}

/*
*   Starts the bot trading
*   Entry point of program
*/
async function momentumStrategy() {
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
    console.log(`Starting price of ${product1} in ${product2} is: ${currentPrice}`);

    // eslint-disable-next-line no-constant-condition
    while (true) {
        if (updatedPositionInfo.positionExists) {
            try {
                await sleep(2000);
                const product1Account = await authedClient.getAccount(accountIDs.product1AccountID);

                if (product1Account.available > 0) {
                    console.log("Entering lose position with: " + product1Account.available + " " + product1);

                    lastPeakPrice = currentPrice;
                    lastValleyPrice = currentPrice;
                    await losePosition(parseFloat(product1Account.available), lastPeakPrice, lastValleyPrice, accountIDs, updatedPositionInfo);
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
                const product2Account = await authedClient.getAccount(accountIDs.product2AccountID);

                if (product2Account.available > 0) {
                    console.log("Entering gain position with: " + product2Account.available + " " + product2);

                    lastPeakPrice = currentPrice;
                    lastValleyPrice = currentPrice;
                    await gainPosition(parseFloat(product2Account.available), lastPeakPrice, lastValleyPrice, updatedPositionInfo);
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

momentumStrategy(); //begin