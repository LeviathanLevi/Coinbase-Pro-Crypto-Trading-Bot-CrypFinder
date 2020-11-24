require('dotenv').config()
const pino = require("pino");
const logger = pino({ level: process.env.LOG_LEVEL || "info" });
const fileSystem = require("fs");
const csv = require("csv-parser");

/**
 * Loops forever until the conditions are right to attempt to sell the position. Every loop sleeps to let the currentPrice update
 * then updates the lastPeak/lastValley price as appropiate, if the price hits a new valley price it will check if the conditions are 
 * met to sell the position and call the method if appropiate.
 * 
 * @param {number} balance              The amount of currency being traded with
 * @param {number} lastPeakPrice        Tracks the price highs
 * @param {number} lastValleyPrice      Tracks the price lows
 * @param {Object} accountIds           The coinbase account ID associated with the API key used for storing a chunk of the profits in coinbase
 * @param {Object} positionInfo         Contains 3 fields, positionExists (bool), positionAcquiredPrice (number), and positionAcquiredCost(number)
 * @param {Object} productInfo          Contains information about the quote/base increment for the product pair
 * @param {Object} depositConfig        Conatins information about whether to do a deposit and for how much after a sell
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
                const minimum = positionInfo.positionAcquiredPrice + (positionInfo.positionAcquiredPrice * (sellPositionProfitDelta + (tradingConfig.highestFee * 2)));
    
                logger.debug(`Sell Position, LVP: ${lastValleyPrice} needs to be less than or equal to ${target} and greater than or equal to ${minimum} to sell`);
    
                if ((lastValleyPrice <= target) && (lastValleyPrice >= minimum)) {
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
        const message = "Error occured in losePosition method.";
        const errorMsg = new Error(err);
        logger.error({ message, errorMsg, err });
        throw err;
    }
}

/**
 * Loops forever until the conditions are right to attempt to buy a position. Every loop sleeps to let the currentPrice update
 * then updates the lastPeak/lastValley price as appropiate, if the price hits a new peak price it will check if the conditions are 
 * met to buy the position and call the method if appropiate.
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
            } else  if (lastValleyPrice > currentPrice) {
                //New valley hit, reset values

                lastPeakPrice = currentPrice;
                lastValleyPrice = currentPrice;
    
                logger.debug(`Buy Position, LVP: ${lastValleyPrice}`);
            }
        }
    } catch (err) {
        const message = "Error occured in gainPosition method.";
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
async function momentumStrategyAnalyzerStart() {
    try {
        const tradingConfig = {
            startingBalance: 500,
            sellPositionProfitDelta: .01,
            sellPositionDelta: .005,
            buyPositionDelta: .005,
            orderPriceDelta: .0015,
            highestFee: .5,
            depositingEnabled: false,
            depositingAmount: 0
        };

        const dataFileName = "btcusd.csv";

        const result = await analyzeStrategy(tradingConfig, dataFileName);
        
    } catch (err) {
        const message = "Error occured in momentumStrategyAnalyzerStart method, shutting down. Check the logs for more information.";
        const errorMsg = new Error(err);
        logger.error({ message, errorMsg, err });
        process.exit(1);
    }
}

async function analyzeStrategy(tradingConfig, dataFileName) {
    try {
        let result = {};
        let completed = false;
        let positionInfo = {
            positionExists: false
        }

        fileSystem.fstat.createReadStream(dataFileName)
        .pipe(csv())
        .on("data", (row) => {
            console.log(row);
        })
        .on("end", () => {
            console.log("End");
        });

        // eslint-disable-next-line no-constant-condition
        while (!completed) {
            if (positionInfo.positionExists) {

                
                await losePosition(parseFloat(baseCurrencyAccount.available), lastPeakPrice, lastValleyPrice, accountIDs, positionInfo, productInfo, depositConfig, tradingConfig);

            } else {


                await gainPosition(tradeBalance, lastPeakPrice, lastValleyPrice, positionInfo, productInfo, tradingConfig);

            }
        }

        return result;
    } catch (err) {
        const message = "Error occured in bot, shutting down. Check the logs for more information.";
        const errorMsg = new Error(err);
        logger.error({ message, errorMsg, err });
        process.exit(1);
    }
}

module.exports = momentumStrategyAnalyzerStart;