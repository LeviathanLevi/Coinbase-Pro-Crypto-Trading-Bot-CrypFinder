const CoinbasePro = require("coinbase-pro");
require('dotenv').config()
const {buyPosition, sellPosition} = require("./buyAndSell");
const coinbaseProLib = require("../../coinbaseProLibrary");
const pino = require("pino");
const logger = pino({ level: process.env.LOG_LEVEL || "info" });
const fileSystem = require("fs");

const key = `${process.env.API_KEY}`;
const secret = `${process.env.API_SECRET}`;
const passphrase = `${process.env.API_PASSPHRASE}`;
 
//******************** Setup these value configurations before running the program ******************************************

//Determines the enviornment, add TRADING_ENV=real to use the real enviornment otherwise defaults to the sandbox:
const apiURI = process.env.TRADING_ENV ==="real" ? "https://api.pro.coinbase.com" : "https://api-public.sandbox.pro.coinbase.com" ;
const websocketURI = process.env.TRADING_ENV ==="real" ? "wss://ws-feed.pro.coinbase.com" :  "wss://ws-feed-public.sandbox.pro.coinbase.com";

//Trading config:
//Global constants, consider tuning these values to optimize the bot's trading: 
const sellPositionDelta = Number(process.env.SELL_POSITION_DELTA) || .02; //The amount of change between peak and valley to trigger a sell off
const buyPositionDelta = Number(process.env.BUY_POSITION_DELTA) || .015; //The amount of change between the valley and peak price to trigger a buy in
const orderPriceDelta = Number(process.env.ORDER_PRICE_DELTA) || .001; //The amount of extra room to give the sell/buy orders to go through

//Currency config:
//The pieces of the product pair, this is the two halves of coinbase product pair (examples of product pairs: BTC-USD, DASH-BTC, ETH-USDC). For BTC-USD the base currency is BTC and the quote currency is USD 
const baseCurrencyName = process.env.BASE_CURRENCY_NAME || "BTC";
const quoteCurrencyName = process.env.QUOTE_CURRENCY_NAME || "USD";

//Profile config:
//Coinbase portfolios (profiles):
const tradingProfileName = process.env.TRADING_PROFILE_NAME || "BTC trader"; //This is the name of the profile you want the bot to trade in
const depositProfileName = process.env.DEPOSIT_PROFILE_NAME || "default"; //This is the name of the profile you want to deposit some profits to

//Deposit config:
const depositingEnabled = process.env.DEPOSITING_ENABLED !== "false"; //Choose whether or not you want you want to deposit a cut of the profits (Options: true/false)
const depositingAmount = Number(process.env.DEPOSITING_AMOUNT) || 0.5; //Enter the amount of profit you want deposited (Options: choose a percent between 1 and 100 in decimal form I.E. .5 = 50%)

// Due to rounding errors the buy order may not have enough funds to execute the order. This is the minimum funds amount in dollars that
// will be left in usd account to avoid this error. Default = 6 cents (.06).
const balanceMinimum = Number(process.env.BALANCE_MINIMUM) || .06; 

//***************************************************************************************************************************
 
//authedClient used to the API calls supported by the coinbase pro api node library
let authedClient = new CoinbasePro.AuthenticatedClient(
  key,
  secret,
  passphrase,
  apiURI
);

//Custom coinbase library used for making the calls not supported by the coinbase pro api node library
const coinbaseLibObject = new coinbaseProLib(key, secret, passphrase, apiURI);

//Global variable tracks the currentPrice. Updated by the websocket
let currentPrice;

/**
 * Makes the program sleep to avoid hitting API limits and let the websocket update
 * 
 * @param {number} ms -> the number of milliseconds to wait 
 */
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
    if (productPair == null) {
        throw new Error("Error in listenForPriceUpdates method. ProductPair is null!");
    }

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

    //turn on the websocket for errors
    websocket.on("error", function(err) {
        const message = "Error occurred in the websocket.";
        const errorMsg = new Error(err);
        logger.error({ message, errorMsg, err });
        listenForPriceUpdates(productPair);
    });

    //Turn on the websocket for closes to restart it
    websocket.on("close", function() {
        logger.debug("WebSocket closed, restarting...");
        listenForPriceUpdates(productPair);
    });

    //Turn on the websocket for messages
    websocket.on("message", function(data) {
        if (data.type === "ticker") {
            if (currentPrice !== data.price) {
                currentPrice = parseFloat(data.price);
                logger.debug("Ticker price: " + currentPrice);
            }
        }
    });
}

/**
 * Loops forever until the conditions are right to attempt to sell the position. Every loop sleeps to let the currentPrice update
 * then updates the lastPeak/lastValley price as appropriate, if the price hits a new valley price it will check if the conditions are 
 * met to sell the position and call the method if appropriate.
 * 
 * @param {number} balance              The amount of currency being traded with
 * @param {number} lastPeakPrice        Tracks the price highs
 * @param {number} lastValleyPrice      Tracks the price lows
 * @param {Object} accountIds           The coinbase account ID associated with the API key used for storing a chunk of the profits in coinbase
 * @param {Object} positionInfo         Contains 3 fields, positionExists (bool), positionAcquiredPrice (number), and positionAcquiredCost(number)
 * @param {Object} productInfo          Contains information about the quote/base increment for the product pair
 * @param {Object} depositConfig        Contains information about whether to do a deposit and for how much after a sell
 * @param {Object} tradingConfig        Contains information about the fees and deltas 
 */
async function losePosition(balance, lastPeakPrice, lastValleyPrice, accountIds, positionInfo, productInfo, depositConfig, tradingConfig) {
    try {
        while (positionInfo.positionExists === true) {
            await sleep(250); //Let price update
    
            if (lastPeakPrice < currentPrice) {
                //New peak hit, reset values
                lastPeakPrice = currentPrice;
                lastValleyPrice = currentPrice;
    
                logger.debug(`Sell Position, LPP: ${lastPeakPrice}`);
            } else if (lastValleyPrice > currentPrice) {
                //New valley hit, track valley and check sell conditions
                lastValleyPrice = currentPrice;
    
                const target = lastPeakPrice - (lastPeakPrice * sellPositionDelta);
                const lowestSellPrice = lastValleyPrice - (lastValleyPrice * orderPriceDelta);
                const receivedValue = (lowestSellPrice * balance) - ((lowestSellPrice * balance) * tradingConfig.highestFee);
    
                logger.debug(`Sell Position, LVP: ${lastValleyPrice} needs to be less than or equal to ${target} to sell and the receivedValue: ${receivedValue} needs to be greater than the positionAcquiredCost: ${positionInfo.positionAcquiredCost}`);
    
                if ((lastValleyPrice <= target) && (receivedValue > positionInfo.positionAcquiredCost)) {
                    logger.info("Attempting to sell position...");

                    //Create a new authenticated client to prevent it from expiring or hitting API limits
                    authedClient = new CoinbasePro.AuthenticatedClient(
                        key,
                        secret,
                        passphrase,
                        apiURI
                    );

                    await sellPosition(balance, accountIds, positionInfo, lastValleyPrice, authedClient, coinbaseLibObject, productInfo, depositConfig, tradingConfig);
                }
            }
        }
    } catch (err) {
        const message = "Error occurred in losePosition method.";
        const errorMsg = new Error(err);
        logger.error({ message, errorMsg, err });
        throw err;
    }
}

/**
 * Loops forever until the conditions are right to attempt to buy a position. Every loop sleeps to let the currentPrice update
 * then updates the lastPeak/lastValley price as appropriate, if the price hits a new peak price it will check if the conditions are 
 * met to buy the position and call the method if appropriate.
 * 
 * @param {number} balance              The amount of currency being traded with
 * @param {number} lastPeakPrice        Tracks the price highs
 * @param {number} lastValleyPrice      Tracks the price lows
 * @param {Object} positionInfo         Contains 3 fields, positionExists (bool), positionAcquiredPrice (number), and positionAcquiredCost(number)
 * @param {Object} productInfo          Contains information about the quote/base increment for the product pair
 * @param {Object} tradingConfig        Contains information about the fees and deltas 
 */
async function gainPosition(balance, lastPeakPrice, lastValleyPrice, positionInfo, productInfo, tradingConfig) {
    try {
        while (positionInfo.positionExists === false) {
            await sleep(250); //Let price update
            
            if (lastPeakPrice < currentPrice) {
                //New peak hit, track peak price and check buy conditions
                lastPeakPrice = currentPrice;
    
                const target = lastValleyPrice + (lastValleyPrice * buyPositionDelta);
    
                logger.debug(`Buy Position, LPP: ${lastPeakPrice} needs to be greater than or equal to ${target} to buy`);
    
                if (lastPeakPrice >= target) {
                    logger.info("Attempting to buy position...");
                    
                    //Create a new authenticated client to prevent it from expiring or hitting API limits
                    authedClient = new CoinbasePro.AuthenticatedClient(
                        key,
                        secret,
                        passphrase,
                        apiURI
                    );

                    await buyPosition(balance, positionInfo, lastPeakPrice, authedClient, productInfo, tradingConfig);
                }
            } else if (lastValleyPrice > currentPrice) {
                //New valley hit, reset values

                lastPeakPrice = currentPrice;
                lastValleyPrice = currentPrice;
    
                logger.debug(`Buy Position, LVP: ${lastValleyPrice}`);
            }
        }
    } catch (err) {
        const message = "Error occurred in gainPosition method.";
        const errorMsg = new Error(err);
        logger.error({ message, errorMsg, err });
        throw err;
    }
}

/**
 * Acquires some account ID information to be used for storing and retrieving information and depositing funds after a sell.
 * 
 * @param {Object} productInfo productInfo contains the base and quote currencies being traded with needed to grab the correct account IDs
 * @return {Object} accountObject contains the needed account IDs and profile IDs needed for checking balances and making transfers
 */
async function getAccountIDs(productInfo) {
    try {
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

        if (!accountObject.depositProfileID) {
            throw new Error(`Could not find the deposit profile ID. Ensure that the depositProfileName: "${depositProfileName}" is spelt correctly.`)
        }
        if (!accountObject.tradeProfileID) {
            throw new Error(`Could not find the trade profile ID. Ensure that the tradingProfileName: "${tradingProfileName}" is spelt correctly.`)
        }

        return accountObject;
    } catch (err) {
        const message = "Error occured in getAccountIDs method.";
        const errorMsg = new Error(err);
        logger.error({ message, errorMsg, err });
        throw err;
    }
}

/**
 * Gets information about the product being traded that the bot can use to determine how
 * accurate the size and quote values for the order needs to be. This method parses the base and quote increment
 * strings in order to determine to what precision the size and price parameters need to be when placing an order.
 * 
 * @param {object} productInfo This object gets updated directly
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
            throw new Error(`Error, could not find a valid matching product pair for "${productInfo.productPair}". Verify the product names is correct/exists.`);
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
        const message = "Error occurred in getProductInfo method.";
        const errorMsg = new Error(err);
        logger.error({ message, errorMsg, err });
        throw err;
    }
}

/**
 * Retrieves the current maker and taker fees and returns the highest one as a number
 * 
 * @param {number} highestFee The highest fee between the taker and maker fee
 */
async function returnHighestFee(){
    try {
        const feeResult = await coinbaseLibObject.getFees();
        
        let makerFee = parseFloat(feeResult.maker_fee_rate);
        let takerFee = parseFloat(feeResult.taker_fee_rate);

        if (makerFee > takerFee) {
            return makerFee;
        } else {
            return takerFee;
        }
    }
    catch (err) {
        const message = "Error occurred in getFees method.";
        const errorMsg = new Error(err);
        logger.error({ message, errorMsg, err });
        throw err;
    }
}

/**
 * This method is the entry point of the momentum strategy. It does some first time initialization then begins an infinite loop.
 * The loop checks the position info to decide if the bot needs to try and buy or sell, it also checks if there's an available 
 * balance to be traded with. Then it calls gainPosition or losePosition appropiately and waits for them to finish and repeats.
 */
async function momentumStrategyStart() {
    try {
        logger.info(`Configuration:\napiURI: ${apiURI}\nwebsocketURI: ${websocketURI}\nsellPositionDelta: ${sellPositionDelta}\nbuyPositionDelta: ${buyPositionDelta}\norderPriceDelta: ${orderPriceDelta}\nbaseCurrencyName: ${baseCurrencyName}\nquoteCurrencyName: ${quoteCurrencyName}\ntradingProfileName: ${tradingProfileName}\ndepositProfileName: ${depositProfileName}\ndepositingEnabled: ${depositingEnabled}\ndepositingAmount: ${depositingAmount}\nbalanceMinimum: ${balanceMinimum}`);

        let accountIDs = {};
        let lastPeakPrice;
        let lastValleyPrice;
        let highestFee = await returnHighestFee();

        const tradingConfig = {
            sellPositionDelta,
            buyPositionDelta,
            orderPriceDelta,
            highestFee
        };

        const depositConfig = {
            depositingEnabled,
            depositingAmount
        };

        const productInfo = {
            baseCurrency: baseCurrencyName,
            quoteCurrency: quoteCurrencyName,
            productPair: baseCurrencyName + "-" + quoteCurrencyName
        };

        let positionInfo;

        //Check for an existing positionData file to start the bot with:
        try {
            //read positionData file:
            let rawFileData = fileSystem.readFileSync("positionData.json");
            positionInfo = JSON.parse(rawFileData);
            logger.info("Found positionData.json file, starting with position data. Position data: " + JSON.stringify(positionInfo));
        } catch (err) {
            if (err.code === "ENOENT") {
                logger.info("No positionData file found, starting with no existing position.");
            } else {
                const message = "Error, failed to read file for a reason other than it doesn't exist. Continuing as normal but positionDataTracking might not work correctly.";
                const errorMsg = new Error(err);
                logger.error({ message, errorMsg, err });
            }

            positionInfo = {
                positionExists: false,
            };
        }

        //Retrieve product information:
        await getProductInfo(productInfo);
        logger.info(productInfo);
        
        //Retrieve account IDs:
        accountIDs = await getAccountIDs(productInfo);
        logger.info(accountIDs)

        //activate websocket for price data:
        listenForPriceUpdates(productInfo.productPair);

        while (currentPrice == null) {
            await sleep(1000); //Get a price before starting
        }
        
        logger.info(`Starting price of ${productInfo.baseCurrency} in ${productInfo.quoteCurrency} is: ${currentPrice}`);

        // eslint-disable-next-line no-constant-condition
        while (true) {
            if (positionInfo.positionExists) {
                tradingConfig.highestFee = await returnHighestFee();
                await sleep(1000);
                const baseCurrencyAccount = await authedClient.getAccount(accountIDs.baseCurrencyAccountID); //Grab account information to view balance

                if (baseCurrencyAccount.available > 0) {
                    logger.info("Entering lose position with: " + baseCurrencyAccount.available + " " + productInfo.baseCurrency);

                    lastPeakPrice = currentPrice;
                    lastValleyPrice = currentPrice;

                    //Begin trying to sell position:
                    await losePosition(parseFloat(baseCurrencyAccount.available), lastPeakPrice, lastValleyPrice, accountIDs, positionInfo, productInfo, depositConfig, tradingConfig);
                } else {
                    throw new Error(`Error, there is no ${productInfo.baseCurrency} balance available for use. Terminating program.`);
                }
            } else {
                tradingConfig.highestFee = await returnHighestFee();
                await sleep(1000);
                const quoteCurrencyAccount = await authedClient.getAccount(accountIDs.quoteCurrencyAccountID); //Grab account information to view balance
                const availableBalance = parseFloat(quoteCurrencyAccount.available);

                if (availableBalance > 0) {
                    const tradeBalance = availableBalance - balanceMinimum; //Subtract this dollar amount so that there is room for rounding errors

                    logger.info("Entering gain position with: " + tradeBalance + " " + productInfo.quoteCurrency);

                    lastPeakPrice = currentPrice;
                    lastValleyPrice = currentPrice;

                    //Begin trying to buy a position:
                    await gainPosition(tradeBalance, lastPeakPrice, lastValleyPrice, positionInfo, productInfo, tradingConfig);
                } else {
                    throw new Error(`Error, there is no ${productInfo.quoteCurrency} balance available for use. Terminating program.`);
                }
            }
        }
    } catch (err) {
        const message = "Error occurred in bot, shutting down. Check the logs for more information.";
        const errorMsg = new Error(err);
        logger.error({ message, errorMsg, err });
        process.exit(1);
    }
}

module.exports = momentumStrategyStart;
