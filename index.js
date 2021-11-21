/* eslint-disable no-unused-vars */
const pino = require("pino");
const logger = pino({ level: process.env.LOG_LEVEL || "info" });

/*
*   This is the entry point of program. Select the strategy or analyzer(s)
*/
const momentumStrategyStart = require("./strategies/momentumTrading/momentumTrading");
const momentumStrategyAnalyzerStart = require("./strategies/momentumTrading/momentumTradingAnalyzer");

const momentumWithStopLossStrategyStart = require("./strategies/momentumTradingWithStopLoss/momentumTradingWithStopLoss");

const reverseMomentumStrategyStart = require("./strategies/reverseMomentumTrading/reverseMomentumTrading");
const reverseMomentumStrategyAnalyzerStart = require("./strategies/reverseMomentumTrading/reverseMomentumTradingAnalyzer");

const strategy = process.env.TRADING_STRATEGY || 'momentum';
const backtest = process.env.BACK_TEST || 'false';

logger.info(`Selected ${strategy} strategy`)

/*** Make sure to configure the momentumStrategy in ./strategies/momentumTrading/momentumTrading.js or in the .env before launching ***/
if (strategy == 'momentum') {
    if (backtest == 'true') {
        //Launches the momentum strategy anaylzer for back testing:
        momentumStrategyAnalyzerStart();
    } else {
    // Launches the momentum strategy and starts the bot:
    momentumStrategyStart();
    }
}

/*** Make sure to configure the momentumStrategy in ./strategies/momentumTrading/momentumTrading.js or in the .env before launching ***/
if (strategy == 'reverse') {
    if (backtest == 'true') {
        //Launches the reverse momentum strategy anaylzer for back testing:
        reverseMomentumStrategyAnalyzerStart();
    } else {
    //Launches the reverse momentum strategy and starts the bot:
    reverseMomentumStrategyStart();
    }
}


/*** Make sure to configure the momentumWithStopLossStrategy in ./strategies/momentumTradingWithStopLoss/momentumTradingWithStopLoss.js or in the .env before launching ***/
if (strategy == 'stoploss') {
    // Launches the momentum with stop loss strategy and starts the bot:
    logger.debug(`Starting stop loss strategy`);
    momentumWithStopLossStrategyStart();
}