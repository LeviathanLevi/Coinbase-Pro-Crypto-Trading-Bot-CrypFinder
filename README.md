# CrypFinder Bot 
## Version 1.4

## CrypFinder Summary: 
CrypFinder is a Coinbase Pro API trading bot that currently implements a basic momentum trading strategy in NodeJS using the Coinbase Pro API, as well as its own custom library for the endpoints that are not supported by the now deprecated Coinbase Pro NodeJS Library. Currently, Coinbase Pro limits the number of portfolios to five, this means that the bot can run up to four trading instances simultaneously per Coinbase Pro account. This bot can be modified to trade any product pairs available on Coinbase Pro, such as BTC-USD, ETH-USD, etc., but stablecoin (USDC to other coins) and crypto markets (coin to other coins) aren't currently supported, only USD markets (USD to coins). 

The currently implemented momentum strategy will work as follows: The bot will start by getting the amount of USD available for the provided API key's profile (profile=portfolio on the coinbase pro website). If the amount is greater than zero, it will monitor the price changes of the chosen product using a peak/valley system; if the price changes by the specified delta, it will purchase a position. Then, it will monitor price changes until the delta condition and profit condition are met; after selling for a profit, it can deposit a cut of the profit to a different portfolio for saving. 

The bot features a number of variables at the top that can be configured to customize how it trades. This includes the deltas that specify an amount of price change that will trigger a buy/sell, the minimum acceptable profit from a trade, the name of currency to trade, the profile names, the deposit enable/disable flag, the deposit amount, and more. Of course, any of the code can be modified to customize it fully. This project is a great way to trade crypto on Coinbase Pro through their API.

## How to run the program:
I suggest starting by using this program in the [Coinbase Pro Sandbox](https://docs.pro.coinbase.com/#sandbox) for testing. 
1. Create a coinbase pro account. Install NodeJS, install Git, consider adding an ESLint plugin to your IDE to use the eslint configuration.
2. Setup your Coinbase Pro account portfolios (portfolios are also referred to as profiles). Each bot that runs needs it's own portfolio. The bot will take any available balance in the portfolio that it's tied to via the API key and start trading with it. Coinbase Pro gives you the default (Default Portfolio) to start with, but, you can add up to four more (5 is the max). Don't use a bot to trade in the default portfolio because that's where money transfers go by default; which, means the funds could get swept up by the bot before you can allocate them where you want. Create a new portfolio for each bot you want to run, for example you could create one called "BTC trader" that the bot trades bitcoin inside of. If you wish to use the feature that deposits all or a portion of profits into another portfolio to save it then by default those deposits will go to the default portfolio, but you have the option to create a different portfolio to use instead. Take note of the profile names you created as you will need them in step 5.
3. Create the API key for the portfolio you want the bot to trade on, give it View/Trade/Transfer permissions and whitelist your public IP. [More info here](https://help.coinbase.com/en/pro/other-topics/api/how-do-i-create-an-api-key-for-coinbase-pro). 
4. Clone the github repo locally and run `npm install` from within the repo directory.
5. Configure the variables at the top of index.js to select your environment, Deltas, product to trade, profile names, etc.
6. Create a .env file in the root directory of the projects repo with the following:

    API_KEY=\<your API key>

    API_SECRET=\<your API secret>

    API_PASSPHRASE=\<your API passphrase>

    Additionally consider adding `LOG_LEVEL=debug` here if you want the full debug logs.

7. Add some funds to your default portfolio and make sure there is no existing coin balance for the product you're trading if you're just starting the bot. See "Restarting the bot" if you want the bot to pick up where it left off after stopping it.
8. Run the program with `node index.js` from within the repo directory.

### Restarting the bot:
If at any point the bot stops running for any reason, the the bot keeps a file called positionData.json that tracks whether or not it was in a position, and the information associated with that position. If you restart the bot it will read that file and automatically pick up where it left off. Don't try to add more coins to the existing position or it will cause unexpected behavior since the bot won't know the associated costs with the newly added coin. You can, at any point, add USD to a portfolio, the bot will start trading with the newly added USD when it completes a buy/sell cycle. If you want to start the bot fresh without existing data, simply make sure there is no left over coin in your profile and delete the positionData.json file.

## How to contribute:
1. Fork the repo.
2. Clone the github repo locally and run `npm install` 
3. Switch to the latest development branch to get the up-to-date progress.
4. Create a new branch with a name that describes the feature/change you're making.
5. Check the roadmap for ideas of things to work on.
6. Make your changes and commit them with a descriptive message.
7. Push your changes upstream.
8. When you're done testing your changes, create a PR in your forked repository. Select LeviathanLevi/Coinbase-Pro-Crypto-Trading-Bot-CrypFinder to merge into. Then wait for approval.

## Running the program out of sandbox:
When you're confident in the configuration/code base and want to run it in the real environment, comment out the sandbox env variables and uncomment out the real API URI variables. Update the .env file with a valid API key. You can run this program on your own machine or consider using a server such as an AWS EC2 instance with an EIP (you need to whitelist the API IP). AWS EC2 offers a free tier instance for a year that works well for hosting.

## Momentum trading strategy analyzer:
The momentumTradingAnalyzer is a way to run data against the momentum trading bot strategy to see how well it performs. It takes in a .csv file with OHLC data. Carston Klein has already compiled a massive dataset that is perfect for this taskm available for free on kaggle [check it out](https://www.kaggle.com/tencars/392-crypto-currency-pairs-at-minute-resolution?select=ampusd.csv). After downloading the file for the coin data you want, just trim the .csv file to the length of time you want to test and run the analyzer with the configuration you want and it will generate a report showing how it did. He also wrote [this article](https://medium.com/coinmonks/how-to-get-historical-crypto-currency-data-954062d40d2d) on how to get similar data yourself.

## Helpful links:
[Coinbase Pro](https://pro.coinbase.com/trade/BTC-USD)

[Coinbase Pro API Docs](https://docs.pro.coinbase.com/#introduction)

[Coinbase Pro NodeJS Library](https://www.npmjs.com/package/coinbase-pro)

[Flow diagram of the momentum strategy, open it in Google draw.io for best results (May be outdated, but can help to give an idea of how the program works)](https://drive.google.com/file/d/1sMg7nWcuCDwHS5wdwHgoe5qqODO7UEFA/view?usp=sharing)

## Roadmap: 
- Implement a way to run the bot against historical data to test and compare the performance of the bot. This would give users a way to optimize the trading configuration values.
- Implement a CLI (command line interface) to control the bot. This would make it so that users won't have to edit the code directly to configure and run the bot.

### Possible future goals:
- Add more strategies or make the current momentum strategy better. If making major changes to a current trading strategy, keep the old version and just add a new version of it to the same folder (momentumTradingV1, V2, etc).

## Interested in the project?:
Consider getting involved. Free to contact the creator on GitHub ([Levi Leuthold](https://github.com/LeviathanLevi)) for information on how to get started! Checkout the product roadmap to see what features are currently planned for the future or add your own ideas. 

## Contributors:
Levi Leuthold - Creator