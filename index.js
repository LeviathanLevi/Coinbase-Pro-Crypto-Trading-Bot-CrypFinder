/*
*   This is the entry point of program. Currently, there is just one strategy but this will be the place where
*   a specific strategy would be selected to start the program with.
*/
const momentumStrategyStart = require("./strategies/momentumTrading/momentumTrading");

//Make sure to configure the momentumStrategy in ./strategies/momentumTrading/momentumTrading.js before launching

//Launches the momentum strategy and starts the bot:
momentumStrategyStart();