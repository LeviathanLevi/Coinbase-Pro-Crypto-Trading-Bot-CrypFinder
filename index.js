/* eslint-disable no-unused-vars */

/*
*   This is the entry point of program. Currently, there is just one strategy but this will be the place where
*   a specific strategy would be selected to start the program with. In the future, this project could use  
*   a command line interface here for controlling it.
*/
const momentumStrategyStart = require("./strategies/momentumTrading/momentumTrading");
const momentumStrategyAnalyzerStart = require("./strategies/momentumTrading/momentumTradingAnalyzer");
//Make sure to configure the momentumStrategy in ./strategies/momentumTrading/momentumTrading.js before launching

//Launches the momentum strategy and starts the bot:
momentumStrategyStart();

//Launches the momentum strategy anaylzer for back testing:
//momentumStrategyAnalyzerStart();