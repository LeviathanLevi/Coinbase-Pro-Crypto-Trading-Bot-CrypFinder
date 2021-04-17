/* eslint-disable no-unused-vars */

/*
*   This is the entry point of program. Select the strategy or analyzer(s)
*/
const momentumStrategyStart = require("./strategies/momentumTrading/momentumTrading");
const momentumStrategyAnalyzerStart = require("./strategies/momentumTrading/momentumTradingAnalyzer");

const reverseMomentumStrategyStart = require("./strategies/reverseMomentumTrading/reverseMomentumTrading");
const reverseMomentumStrategyAnalyzerStart = require("./strategies/reverseMomentumTrading/reverseMomentumTradingAnalyzer");


/*** Make sure to configure the momentumStrategy in ./strategies/momentumTrading/momentumTrading.js before launching ***/
//Launches the momentum strategy and starts the bot:
//momentumStrategyStart();

//Launches the momentum strategy anaylzer for back testing:
//momentumStrategyAnalyzerStart();



/*** Make sure to configure the momentumStrategy in ./strategies/momentumTrading/momentumTrading.js before launching ***/
//Launches the reverse momentum strategy and starts the bot:
//reverseMomentumStrategyStart();

//Launches the reverse momentum strategy anaylzer for back testing:
reverseMomentumStrategyAnalyzerStart();