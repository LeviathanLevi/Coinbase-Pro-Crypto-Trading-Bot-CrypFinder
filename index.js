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
const sellPositionProfitDelta = .01; //Minimum amount of money needed to be made before selling position the program will account for taker and maker fees as well
const sellPositionDelta = .005; //The amount of change between peak and valley to trigger a sell off
const buyPositionDelta = .005; //The amount of change between the peak and valley price to trigger a buy in
const orderPriceDelta = .0015; //The amount of extra room to give the sell/buy orders to go through
const takerFee = .005; //Orders that provide liquidity are maker orders, subject to maker fees
const makerFee = .005; //Orders that take liquidity are taker orders, subject to taker fees

//The pieces of the product pair, this is the two halves of coinbase product pair (examples of product pairs: BTC-USD, DASH-BTC, ETH-USDC). For BTC-USD the base currency is BTC and the quote currency is USD 
const baseCurrencyName = "BTC";
const quoteCurrencyName = "USD";

//Coinbase portfolios (profiles):
const tradingProfileName = "BTC trader"; //This is the name of the profile you want the bot to trade in
const depositProfileName = "Profit savings"; //This is the name of the profile you want to deposit some profits to

//*****************************************************************************************************************
 
//authedClient used to the API calls supported by the coinbase pro api node library
const authedClient = new CoinbasePro.AuthenticatedClient(
  key,
  secret,
  passphrase,
  apiURI
);

//Custom coinbase library used for making the calls not supported by the coinbase pro api node library
const coinbaseLibObject = new coinbaseProLib(key, secret, passphrase, apiURI);

//Global variable tracks the currentPrice. Updated by the websocket
let currentPrice;

//Makes the program sleep to avoid hitting API limits and like the websocket update
function sleep(ms) {
    return new Promise((resolve) => {
        setTimeout(resolve, ms);
    });
}   

/**
 * Creates the websocket object and turns it on to update the currentPrice
 * 
 * @param {string} productPair 
 */
function listenForPriceUpdates(productPair) {
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

    websocket.on("message", function(data) {
        if (data.type === "ticker") {
            currentPrice = parseFloat(data.price);
        }
    });

    websocket.on("error", err => {
        const message = "Error occured in the websocket.";
        const errorMsg = new Error(err);
        console.log({ message, errorMsg, err });
        process.exit(1);
    });
}

/** 
 * Loops forever until the conditions are right to attempt to sell the position
 * 
 * @param {number} balance              The amount of currency being traded with
 * @param {number} lastPeakPrice        Tracks the price highs
 * @param {number} lastValleyPrice      Tracks the price lows
 * @param {object} accountIds           The coinbase account ID associated with the API key used for storing a chunk of the profits in coinbase
 * @param {object} updatedPositionInfo  Contains 3 fields, positionExists (bool), positionAcquiredPrice (number), and positionAcquiredCost(number)
*/
async function losePosition(balance, lastPeakPrice, lastValleyPrice,  accountIds, updatedPositionInfo, productInfo) {
    while (updatedPositionInfo.positionExists === true) {
        await sleep(2000);

        if (lastPeakPrice < currentPrice) {
            lastPeakPrice = currentPrice;
            lastValleyPrice = currentPrice;
        } else if (lastValleyPrice > currentPrice) {
            lastValleyPrice = currentPrice;

            if ((lastValleyPrice < lastPeakPrice - (lastPeakPrice * sellPositionDelta)) && (lastValleyPrice >= (updatedPositionInfo.positionAcquiredPrice + (updatedPositionInfo.positionAcquiredPrice * (sellPositionProfitDelta + makerFee + takerFee))))) {
                console.log("Attempting to sell position...");
                await sellPosition(balance, accountIds, updatedPositionInfo, currentPrice, orderPriceDelta, authedClient, coinbaseLibObject, productInfo);
            }
        }
    }
}

/** 
 * Loops forever until the conditions are right to attempt to buy the position
 * 
 * @param {number} balance              The amount of currency being traded with
 * @param {number} lastPeakPrice        Tracks the price highs
 * @param {number} lastValleyPrice      Tracks the price lows
 * @param {object} updatedPositionInfo  Contains 3 fields, positionExists (bool), positionAcquiredPrice (number), and positionAcquiredCost(number)
*/
async function gainPosition(balance, lastPeakPrice, lastValleyPrice, updatedPositionInfo, productInfo) {
    while (updatedPositionInfo.positionExists === false) {
        await sleep(2000);
        
        if (lastPeakPrice < currentPrice) {
            lastPeakPrice = currentPrice;
            if (currentPrice > (lastValleyPrice + (lastValleyPrice * buyPositionDelta))) {
                console.log("Attempting to buy position...");
                await buyPosition(balance, updatedPositionInfo, takerFee, currentPrice, orderPriceDelta, authedClient, productInfo);
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
async function getAccountIDs(productInfo) {
    let accountObject = {};
    
    //Gets the account IDs for the product pairs in the portfolio
    const accounts = await authedClient.getAccounts();

    for (let i = 0; i < accounts.length; ++i) {
        if (accounts[i].currency === productInfo.baseCurrency) {
            accountObject.baseCurrencyAccountID = accounts[i].id;
        } else if (accounts[i].currency === productInfo.quoteCurrency) {
            accountObject.quoteCurrencyAccountID = accounts[i].id;
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

/**
 * Gets information about the product being traded that the bot can use to determine how
 * accurate the size and quote values for the order needs to be.
 * 
 * @param {object} productInfo 
 */
async function getProductInfo(productInfo) {
    try {
        let quoteIncrementRoundValue = 0;
        let baseIncrementRoundValue = 0;
        let productPairData;

        const products = await authedClient.getProducts();

        for (let i = 0; i < products.length; ++i) { 
            if (products[i].id === productInfo.productPair) {
                productPairData = products[i];
            }
        }
        
        if (productPairData === undefined) {
            throw new Error(`Error, could not find a valid matching product pair for "${productInfo.productPair}". Verify the name is correct.`);
        }

        for (let i = 2; i < productPairData.quote_increment.length; ++i) {
            if (productPairData.quote_increment[i] === "1") {
                quoteIncrementRoundValue++;
                break;
            } else {
                quoteIncrementRoundValue++;
            }
        }

        if (productPairData.base_increment[0] !== "1") {
            for (let i = 2; i < productPairData.base_increment.length; ++i) {
                if (productPairData.base_increment[i] === "1") {
                    baseIncrementRoundValue++;
                    break;
                } else {
                    baseIncrementRoundValue++;
                }
            }
        }

        productInfo.quoteIncrementRoundValue = Number(quoteIncrementRoundValue);
        productInfo.baseIncrementRoundValue = Number(baseIncrementRoundValue);
    } catch (err) {
        const message = "Error occured in getProfuctInfo method.";
        const errorMsg = new Error(err);
        console.log({ message, errorMsg, err });
    }
}

/*
*   Starts the bot trading
*   Entry point of program
*/
async function momentumStrategy() {
    try {
        let accountIDs = {};
        let lastPeakPrice;
        let lastValleyPrice;
        let updatedPositionInfo = {
            positionExists: false,
        };
        let productInfo = {
            baseCurrency: baseCurrencyName,
            quoteCurrency: quoteCurrencyName,
            productPar: baseCurrencyName + "-" + quoteCurrencyName
        }

        //Retrieve account IDs:
        accountIDs = await getAccountIDs();
        
        console.log(accountIDs)

        //Retrieve product information:
        await getProductInfo(productInfo);

        console.log(productInfo);

        //activate websocket for price data:
        listenForPriceUpdates();
        await sleep(60000);
        console.log(`Starting price of ${productInfo.baseCurrency} in ${productInfo.quoteCurrency} is: ${currentPrice}`);

        // eslint-disable-next-line no-constant-condition
        while (true) {
            if (updatedPositionInfo.positionExists) {
                try {
                    await sleep(2000);
                    const baseCurrencyAccount = await authedClient.getAccount(accountIDs.baseCurrencyAccountID);

                    if (baseCurrencyAccount.available > 0) {
                        console.log("Entering lose position with: " + baseCurrencyAccount.available + " " + productInfo.baseCurrency);

                        lastPeakPrice = currentPrice;
                        lastValleyPrice = currentPrice;

                        await losePosition(parseFloat(baseCurrencyAccount.available), lastPeakPrice, lastValleyPrice, accountIDs, updatedPositionInfo, productInfo);
                    } else {
                        throw new Error(`Error, there is no ${productInfo.baseCurrency} balance available for use. Terminating program.`);
                    }

                } catch (err) {
                    const message = "Error occured when positionExists equals true";
                    const errorMsg = new Error(err);
                    console.log({ message, errorMsg, err });
                    process.exit(1);
                }
            } else {
                try {
                    await sleep(2000);
                    const quoteCurrencyAccount = await authedClient.getAccount(accountIDs.quoteCurrencyAccountID);

                    if (quoteCurrencyAccount.available > 0) {
                        console.log("Entering gain position with: " + quoteCurrencyAccount.available + " " + productInfo.quoteCurrency);

                        lastPeakPrice = currentPrice;
                        lastValleyPrice = currentPrice;

                        await gainPosition(parseFloat(quoteCurrencyAccount.available), lastPeakPrice, lastValleyPrice, updatedPositionInfo, productInfo);
                    } else {
                        throw new Error(`Error, there is no ${productInfo.quoteCurrency} balance available for use. Terminating program.`);
                    }

                } catch (err) {
                    const message = "Error occured when positionExists equals false";
                    const errorMsg = new Error(err);
                    console.log({ message, errorMsg, err });
                    process.exit(1);
                }
            }
        }
    } catch (err) {
        const message = "Error occured in momentumStrategy method.";
        const errorMsg = new Error(err);
        console.log({ message, errorMsg, err });
    }
}

momentumStrategy(); //begin



// async function test() {
//     let productInfo = {
//         product1: product1,
//         product2: product2,
//         productPair: product1 + "-" + product2
//     }
//     console.log(productInfo);
//     await getProductInfo(productInfo);
//     console.log(productInfo);
// }

// test();