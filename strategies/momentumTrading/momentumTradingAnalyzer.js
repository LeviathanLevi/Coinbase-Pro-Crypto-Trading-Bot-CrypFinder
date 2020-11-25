require('dotenv').config()
const pino = require("pino");
const logger = pino({ level: process.env.LOG_LEVEL || "info" });
const fileSystem = require("fs").promises;
const csvParser = require("csv-parse/lib/sync");

async function losePosition(positionInfo, tradingConfig, priceInfo, result) {
    try {
        if (priceInfo.lastPeakPrice < priceInfo.currentPrice) {
            //New peak hit, reset values
            priceInfo.lastPeakPrice = priceInfo.currentPrice;
            priceInfo.lastValleyPrice = priceInfo.currentPrice;
        } else if (priceInfo.lastValleyPrice > priceInfo.currentPrice) {
            //New valley hit, track valley and check sell conditions
            priceInfo.lastValleyPrice = priceInfo.currentPrice;

            const target = priceInfo.lastPeakPrice - (priceInfo.lastPeakPrice * tradingConfig.sellPositionDelta);
            //logger.info(`position: ${positionInfo.positionAcquiredPrice}`);
            const minimum = positionInfo.positionAcquiredPrice + (positionInfo.positionAcquiredPrice * (tradingConfig.sellPositionProfitDelta + (tradingConfig.highestFee * 2)));

            //logger.info(`target: ${target}, min: ${minimum}`);
            if ((priceInfo.lastValleyPrice <= target) && (priceInfo.lastValleyPrice >= minimum)) {
                logger.debug(`sell price: ${priceInfo.currentPrice}`);

                //Sell position:
                result.numberOfSells += 1;
                //logger.info(`asset: ${positionInfo.assetAmount}`);
                if (tradingConfig.depositingEnabled) {
                    const profit = (positionInfo.assetAmount * priceInfo.currentPrice) - (tradingConfig.highestFee * tradingConfig.startingBalance) - positionInfo.positionAcquiredCost;
                    result.deposits += profit;
                    logger.info(`profit: ${profit}`);

                    positionInfo.fiatBalance = (positionInfo.assetAmount * priceInfo.currentPrice) - ((positionInfo.assetAmount * priceInfo.currentPrice) * tradingConfig.highestFee) - profit;
                } else {
                    positionInfo.fiatBalance = (positionInfo.assetAmount * priceInfo.currentPrice) - ((positionInfo.assetAmount * priceInfo.currentPrice) * tradingConfig.highestFee);
                }

                positionInfo.assetAmount = 0;
                positionInfo.positionExists = false;
                positionInfo.positionAcquiredPrice = 0;
                positionInfo.positionAcquiredCost = 0;

                
                logger.debug(positionInfo);
            }
        }
    } catch (err) {
        const message = "Error occured in losePosition method.";
        const errorMsg = new Error(err);
        logger.error({ message, errorMsg, err });
        throw err;
    }
}

async function gainPosition(positionInfo, tradingConfig, priceInfo, result) {
    try {
        if (priceInfo.lastPeakPrice < priceInfo.currentPrice) {
            //New peak hit, track peak price and check buy conditions
            priceInfo.lastPeakPrice = priceInfo.currentPrice;

            const target = priceInfo.lastValleyPrice + (priceInfo.lastValleyPrice * tradingConfig.buyPositionDelta);

            if (priceInfo.lastPeakPrice >= target) {
                result.numberOfBuys += 1;

                //logger.info(`fiat: ${positionInfo.fiatBalance}, priceInfo: ${priceInfo.currentPrice}`);
                positionInfo.positionAcquiredCost = positionInfo.fiatBalance;
                positionInfo.assetAmount = (positionInfo.fiatBalance - (positionInfo.fiatBalance * tradingConfig.highestFee)) / priceInfo.currentPrice;
                positionInfo.positionAcquiredPrice = priceInfo.currentPrice;
                positionInfo.fiatBalance = 0;
                positionInfo.positionExists = true;

                logger.debug(positionInfo);
            }
        } else if (priceInfo.lastValleyPrice > priceInfo.currentPrice) {
            //New valley hit, reset values
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

async function momentumStrategyAnalyzerStart() {
    try {
        const tradingConfig = {
            startingBalance: 500,
            sellPositionProfitDelta: .01,
            sellPositionDelta: .03,
            buyPositionDelta: .01,
            orderPriceDelta: .0015,
            highestFee: .005,
            depositingEnabled: false
        };

        const dataFileName = "btcusd.csv";

        const result = await analyzeStrategy(tradingConfig, dataFileName);

        logger.info(result);
        
    } catch (err) {
        const message = "Error occured in momentumStrategyAnalyzerStart method, shutting down. Check the logs for more information.";
        const errorMsg = new Error(err);
        logger.error({ message, errorMsg, err });
        process.exit(1);
    }
}

async function analyzeStrategy(tradingConfig, dataFileName) {
    try {
        let result = {
            numberOfBuys: 0,
            numberOfSells: 0,
            amountOfProfitGenerated: 0,
            deposits: 0
        };
        let positionInfo = {
            positionExists: false,
            fiatBalance: tradingConfig.startingBalance
        }

        const fileContent = await fileSystem.readFile(dataFileName);
        const records = csvParser(fileContent, {columns: true});
        
        const priceInfo = {
            currentPrice: parseFloat(records[0].high),
            lastPeakPrice: parseFloat(records[0].high),
            lastValleyPrice: parseFloat(records[0].high)
        };

        for (let i = 1; i < records.length; ++i) {
            priceInfo.currentPrice = parseFloat(records[i].high);

            if (positionInfo.positionExists) {
                await losePosition(positionInfo, tradingConfig, priceInfo, result);
            } else {
                await gainPosition(positionInfo, tradingConfig, priceInfo, result);
            }
        }

        if (tradingConfig.depositingEnabled) {
            if (positionInfo.positionExists) {
                result.amountOfProfitGenerated = positionInfo.assetAmount * priceInfo.currentPrice - tradingConfig.startingBalance;
                result.amountOfProfitGenerated += result.deposits;
            } else {
                result.amountOfProfitGenerated = result.deposits;
            }
        } else {
            if (positionInfo.positionExists) {
                result.amountOfProfitGenerated = positionInfo.assetAmount * priceInfo.currentPrice - tradingConfig.startingBalance;
            } else {
                result.amountOfProfitGenerated = positionInfo.fiatBalance - tradingConfig.startingBalance;
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