/* eslint-disable no-unused-vars */

/*
*   This is the entry point of program. Currently, there is just one strategy but this will be the place where
*   a specific strategy would be selected to start the program with. In the future, this project could use  
*   a command line interface here for controlling it.
*/
const momentumStrategyStartV1 = require("./strategies/momentumTrading//momentumTradingV1/momentumTrading");
const momentumStrategyStartV2 = require("./strategies/momentumTrading//momentumTradingV2/momentumTrading");
const momentumStrategyAnalyzerStartV2 = require("./strategies/momentumTrading/MomentumTradingV2/momentumTradingAnalyzer");

// Make sure to setup the configuration variables in whichever bot you're running before launching
// Check the Version#.md in the strategies folder for more information on the difference between versions

// ***************Momentum trading********************

//Launches the momentum strategy V2 (latest) and starts the bot:
momentumStrategyStartV2();

//Launches the momentum strategy V1 and starts the bot:
//momentumStrategyStartV1();

//Launches the momentum strategy anaylzer for back testing data:
//momentumStrategyAnalyzerStartV2();

// ***************************************************