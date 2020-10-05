# CrypFinder Bot 
## Version 1.16

## CrypFinder Summary: 
CrypFinder is a Coinbase Pro API trading bot that currently implements a basic momentum trading strategy in NodeJS using the Coinbase Pro API and it's own custom libray for the endpoints not supported by the now deprecated Coinbase Pro NodeJS Lib. This bot can run multiple trading instances for up to 4 profiles per coinbase account. This bot can be modified to trade any product pairs available on Coinbase Pro, such as BTC-USD, ETH-USD, etc, but stablecoin and crypto markets haven't been tested yet, only USD markets. The currently implemented momentumStrategy will work as follows: The bot will start by getting the amount of USD available for the provided API key's profile. If the amount is greater than 0 it will monitor the price changes of the chosen product using a peak/valley system if the price changes by the specified delta it will purchase a position. Then it will monitor price changes until the delta condition is met and profit condition, after selling for a profit it will transfer 40% to the named deposit profile belonging to the user and then reinvest the other 60% and repeat the trading process. 

Of course everything can be tweaked and modified. I plan to update and improve this project as I have time. Checkout the product roadmap to see what features are needded/planned for the future. Consider getting involved in the project, if you're interested in trading crypto through the coinbase pro API, this bot would be a good starting point. Feel free to contact me (Levi Leuthold) on how to get started.

## How to run the program:
I sugguest starting by using this program in the [Coinbase Pro Sandbox](https://docs.pro.coinbase.com/#sandbox) for testing. 
1. Create a coinbase pro account. Install NodeJS, install Git, consider adding an ESLint plugin to your IDE to use the eslint configuration.
2. Setup you're Coinbase Pro account portfolios (profiles), this is an important part of the bot. The bot will swoop up any available balance in a profile and start trading with it, so in order to safely store some of the profits you must specify another profile to deposit to. Currently Coinbase Pro limits profiles to 5. I recommend setting up the portfolios with the Default, Profit savings, and ___ trader (I.E. 'BTC trader' if it's trading BTC) for the other availabe 3 slots. Don't trade in the default profile because if you transfer money in it could get swept up by the bot before you can allocate it where you want to. Alternatively, you could deposit profits in the default portfolio, this would open up 4 profiles for bot trading. 
3. Create the API key for the profile you want the bot to trade on, give it View/Trade/Transfer permissions and whitelist your public IP.
4. Clone the github repo locally and run `npm install`
5. Configure the variables at the top of index.js to select your enviornment, Deltas, fee amounts, product to trade, and profile names.
6. Create a .env file with the following:

    API_KEY=\<your API key>

    API_SECRET=\<your API secret>

    API_PASSPHRASE=\<your API passphrase>
7. Add some funds to your default portfolio, and make sure there is no existing coin balance for the product you're trading.
9. run the program with `node index.js`

## How to contribute:
1. Fork the repo.
2. Clone the github repo locally and run `npm install` 
3. Optionally, create a branch with a name that describes the feature/change you're making.
4. Check the roadmap for ideas of things to work one.
5. Make you're changes and commit as you go describing the changes.
6. Push your changes upstream.
7. When you're satisfied testing your changes, create a PR in you're forked repository. Select LeviathanLevi/Coinbase-Pro-Crypto-Trading-Bot-CrypFinder to merge into. Then wait for approval.

## Running the program out of sandbox:
When you're confident in the code base and want to run it in the real enviornment then comment out the sandbox env variables and uncomment out the real env variables. You can run this program on your own machine or consider using something like an AWS EC2 instance with an EIP (you need to whitelist the API IP). Also be sure you understand the code and have done adequate testing before running this bot with real money (you're responsible for any losses 😃). I encountered some issues where the program would hang after awhile running on my Windows 10 home laptop, but not on an AWS Linux server instance. Consider using a linux server for the best stability.

## Helpful links:
[Coinbase Pro](https://pro.coinbase.com/trade/BTC-USD)

[Coinbase Pro Docs](https://docs.pro.coinbase.com/#introduction)

[Coinbase Pro NodeJS Library](https://www.npmjs.com/package/coinbase-pro)

[Flow diagram of the momentum strategy(May be outdated, but, can help to give an idea of the how the program works)](https://drive.google.com/file/d/1sMg7nWcuCDwHS5wdwHgoe5qqODO7UEFA/view?usp=sharing)

## Roadmap: 
- Add more code documenation
- Add a structured logging system
- Add some variables that can disable profit deposits or adjust the amount being deposited.
- Test trading on stable coin market and implement any fixes needed to make it work.
- Test trading on Crypto markets and implement any fixes needed to make it work.
- Add a method to the coinbaseProLibrary.js to call this endpoint [GET /fees] to get the current taker/maker fees for the user so that those values don't have to be manually entered.
- Organize the code so that there's a folder for other trading strategies (IE mometum, mean reversion, etc). Then use index.js to select the starting strategy.
- Implement a CLI (commands) to control the both rather than requiring users to edit the code directly.
### Possible future goals:
- Add more strategies or make the current one(s) smarter
- Implement a way to run the bot against historical data to test performance
- Implement testing 

## Contributors:
Levi Leuthold - Creator, feel free to contact me (https://github.com/LeviathanLevi) for help on getting started or more information 
