/*  
 * Summary: The momentumTradingAnalyzer reads a CSV file for prices and runs the bot with a given configuration.
 * After processing all of the price history the analyzer gives report containing how much profit it made, how many trades
 * it made, etc. This can be used to test the bot against historical date and get an idea of how it performs with a specfic setup.
 * Consider creating a loop to test a range of values and let the analyzer figure out the most optimal trade configuration.
 * 
 * For more information regarding the type of data and files that it's setup to use, see the readme.
 */
require('dotenv').config()
const pino = require("pino");
const logger = pino({ level: process.env.LOG_LEVEL || "info" });
const fileSystem = require("fs").promises;
const csvParser = require("csv-parse/lib/sync");

//***************Trade configuration*****************

//The name of the file containing the data to be tested:
const dataFileName = "xtzusd.csv";

//The bot trading config values (See momentumTrading.js for more information on these values):
const tradingConfig = {
    startingBalance: 500,       //Amount of cash the bot starts with
    sellPositionDelta: .0001,
    buyPositionDelta: .0001,
    orderPriceDelta: .001,
    highestFee: .005,
    depositingEnabled: false    //Whether or not the profits are deposited or re-invested
};

//***************************************************

/**
 * See losePosition in momentumTrading.js for more information, this is the same but for the analyzer
 * 
 * @param {object} positionInfo 
 * @param {object} tradingConfig 
 * @param {object} priceInfo 
 * @param {object} report 
 */
async function losePosition(positionInfo, tradingConfig, priceInfo, report) {
    try {
        if (priceInfo.lastPeakPrice < priceInfo.currentPrice) {
            priceInfo.lastPeakPrice = priceInfo.currentPrice;
            priceInfo.lastValleyPrice = priceInfo.currentPrice;
        } else if (priceInfo.lastValleyPrice > priceInfo.currentPrice) {
            priceInfo.lastValleyPrice = priceInfo.currentPrice;

            const target = priceInfo.lastPeakPrice - (priceInfo.lastPeakPrice * tradingConfig.sellPositionDelta);
            const lowestSellPrice = priceInfo.lastValleyPrice - (priceInfo.lastValleyPrice * tradingConfig.orderPriceDelta);
            const receivedValue = (lowestSellPrice * positionInfo.assetAmount) - ((lowestSellPrice * positionInfo.assetAmount) * tradingConfig.highestFee);

            if ((priceInfo.lastValleyPrice <= target) && (receivedValue > positionInfo.positionAcquiredCost)) {
                //Sell position:
                logger.debug(`Sell position price: ${priceInfo.currentPrice}`);
                report.numberOfSells += 1;

                if (tradingConfig.depositingEnabled) {
                    const profit = (positionInfo.assetAmount * priceInfo.currentPrice) - (tradingConfig.highestFee * (positionInfo.assetAmount * priceInfo.currentPrice)) - positionInfo.positionAcquiredCost;
                    report.amountOfProfitGenerated += profit;
                    logger.debug(`amount of profit: ${report.amountOfProfitGenerated}`);

                    logger.debug(`profit: ${profit}`);

                    positionInfo.fiatBalance = (positionInfo.assetAmount * priceInfo.currentPrice) - ((positionInfo.assetAmount * priceInfo.currentPrice) * tradingConfig.highestFee) - profit;
                } else {
                    positionInfo.fiatBalance = (positionInfo.assetAmount * priceInfo.currentPrice) - ((positionInfo.assetAmount * priceInfo.currentPrice) * tradingConfig.highestFee);
                }

                positionInfo.assetAmount = 0;
                positionInfo.positionExists = false;
                positionInfo.positionAcquiredPrice = 0;
                positionInfo.positionAcquiredCost = 0;

                logger.debug(`Position info after sell: ${JSON.stringify(positionInfo)}`);
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
 * See gainPosition in momentumTrading.js for more information, this is the same but for the analyzer
 * 
 * @param {object} positionInfo 
 * @param {object} tradingConfig 
 * @param {object} priceInfo 
 * @param {object} report 
 */
async function gainPosition(positionInfo, tradingConfig, priceInfo, report) {
    try {
        if (priceInfo.lastPeakPrice < priceInfo.currentPrice) {
            priceInfo.lastPeakPrice = priceInfo.currentPrice;

            const target = priceInfo.lastValleyPrice + (priceInfo.lastValleyPrice * tradingConfig.buyPositionDelta);

            if (priceInfo.lastPeakPrice >= target) {
                //buy position:
                logger.debug(`Buy position price: ${priceInfo.currentPrice}`);
                report.numberOfBuys += 1;

                positionInfo.positionAcquiredCost = positionInfo.fiatBalance;
                positionInfo.assetAmount = (positionInfo.fiatBalance - (positionInfo.fiatBalance * tradingConfig.highestFee)) / priceInfo.currentPrice;
                positionInfo.positionAcquiredPrice = priceInfo.currentPrice;
                positionInfo.fiatBalance = 0;
                positionInfo.positionExists = true;

                logger.debug(`Position info after buy: ${JSON.stringify(positionInfo)}`);
            }
        } else if (priceInfo.lastValleyPrice > priceInfo.currentPrice) {
            priceInfo.lastPeakPrice = priceInfo.currentPrice;
            priceInfo.lastValleyPrice = priceInfo.currentPrice;
        }
    } catch (err) {
        const message = "Error occured in gainPosition method.";
        const errorMsg = new Error(err);
        logger.error({ message, errorMsg, err });
        throw err;
    }
}

/**
 * Entry point, sets up and calls the analyze strategy method to begin.
 * This is the method someone could use to setup loops to test a range of trading config values to
 * find the optimal configuration for a given set of data.
 */
async function momentumStrategyAnalyzerStart() {
    try {
        //Run once:
        const report = await analyzeStrategy(tradingConfig, dataFileName);
        logger.info(report);

        //Instead of running it once someone could configure it to run loops for a given range of values to find the most optimal config
        //Just setup the tradingConfig to be your starting values then let the loops increment the values and run the report then compare for the most profitable
        //Example: 

        // let highestProfit = {};
        // let tradingConfigCopy = Object.assign({}, tradingConfig);

        // //baseline:
        // const report = await analyzeStrategy(tradingConfig, dataFileName);
        // highestProfit.report = report;
        // highestProfit.configuration = Object.assign({}, tradingConfig);

        // for (let i = 0; i < 50; i += 1) {
        //     tradingConfigCopy.buyPositionDelta = tradingConfig.buyPositionDelta;

        //     for (let j = 0; j < 50; j += 1) {
        //         logger.debug(tradingConfig);

        //         const report = await analyzeStrategy(tradingConfigCopy, dataFileName);

        //         if (highestProfit.report.amountOfProfitGenerated < report.amountOfProfitGenerated) {
        //             highestProfit.report = report;
        //             highestProfit.configuration = Object.assign({}, tradingConfigCopy);

        //             logger.info(highestProfit);
        //         }

        //         tradingConfigCopy.buyPositionDelta += .001; 
        //     }  

        //     tradingConfigCopy.sellPositionDelta += .001;
        // }

        // logger.info("Final Report:");
        // logger.info(highestProfit);

    } catch (err) {
        const message = "Error occured in momentumStrategyAnalyzerStart method, shutting down. Check the logs for more information.";
        const errorMsg = new Error(err);
        logger.error({ message, errorMsg, err });
        process.exit(1);
    }
}

/**
 * Tests the given tradingConfig against the data in the file to then returns a report on the results
 * 
 * @param {object} tradingConfig 
 * @param {string} dataFileName 
 */
async function analyzeStrategy(tradingConfig, dataFileName) {
    try {
        let report = {
            numberOfBuys: 0,
            numberOfSells: 0,
            amountOfProfitGenerated: 0
        };
        let positionInfo = {
            positionExists: false,
            fiatBalance: tradingConfig.startingBalance
        }

        const fileContent = await fileSystem.readFile(dataFileName);
        const records = csvParser(fileContent, { columns: true });

        const priceInfo = {
            currentPrice: parseFloat(records[0].high),
            lastPeakPrice: parseFloat(records[0].high),
            lastValleyPrice: parseFloat(records[0].high)
        };

        for (let i = 1; i < records.length; ++i) {
            priceInfo.currentPrice = parseFloat(records[i].high);

            if (positionInfo.positionExists) {
                await losePosition(positionInfo, tradingConfig, priceInfo, report);
            } else {
                await gainPosition(positionInfo, tradingConfig, priceInfo, report);
            }
        }

        if (positionInfo.positionExists) {
            report.amountOfProfitGenerated += ((positionInfo.assetAmount * priceInfo.currentPrice) - ((positionInfo.assetAmount * priceInfo.currentPrice) * tradingConfig.highestFee)) - tradingConfig.startingBalance;
        } else {
            if (!tradingConfig.depositingEnabled) {
                report.amountOfProfitGenerated = positionInfo.fiatBalance - tradingConfig.startingBalance;
            }
        }

        return report;

    } catch (err) {
        const message = "Error occured in analyzeStrategy method.";
        const errorMsg = new Error(err);
        logger.error({ message, errorMsg, err });
        throw err;
    }
}

module.exports = momentumStrategyAnalyzerStart;