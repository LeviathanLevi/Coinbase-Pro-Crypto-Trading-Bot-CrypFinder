# CrypFinder Bot 
## Version 1.55

## Summary: 
CrypFinder is a Coinbase Pro API trading bot that currently implements a basic momentum trading strategy and reverse momentum trading strategy in NodeJS using the Coinbase Pro API, as well as its own custom library for the endpoints that are not supported by the now deprecated Coinbase Pro NodeJS Library. Currently, Coinbase Pro limits the number of portfolios to five, this means that the bot can run up to four trading instances simultaneously per Coinbase Pro account. This bot can be modified to trade any product pairs available on Coinbase Pro, such as BTC-USD, ETH-USD, etc., but stablecoin (USDC to other coins) and crypto markets (coin to other coins) aren't currently tested, only USD markets (USD to coins). 

The momentum strategy will work as follows: The bot will start by getting the amount of USD available for the provided API key's profile (profile=portfolio on the coinbase pro website). If the amount is greater than zero, it will monitor the price changes of the chosen product using a peak/valley system; if the price changes by the specified delta, it will purchase a position. Then, it will monitor price changes until the delta condition and profit condition are met; after selling for a profit, it can deposit a cut of the profit to a different portfolio for saving. The reverse momentum trading strategy, is, as the name implies the reverse where it sells when the price goes up and buys when it goes down.

The bot features a number of variables at the top that can be configured to customize how it trades. This includes the deltas that specify an amount of price change that will trigger a buy/sell, the minimum acceptable profit from a trade, the name of currency to trade, the profile names, the deposit enable/disable flag, the deposit amount, and more. Of course, any of the code can be modified to customize it fully. This project is a great way to trade crypto on Coinbase Pro through their API.

## How to run the program:
I suggest starting by using this program in the [Coinbase Pro Sandbox](https://docs.pro.coinbase.com/#sandbox) for testing. 
1. Create a coinbase pro account. Install NodeJS, install Git, consider adding an ESLint plugin to your IDE to use the eslint configuration.
2. Setup your Coinbase Pro account portfolios (portfolios are also referred to as profiles). Each bot that runs needs it's own portfolio. The bot will take any available balance in the portfolio that it's tied to via the API key and start trading with it. Coinbase Pro gives you the default (Default Portfolio) to start with, but, you can add up to four more (5 is the max). Don't use a bot to trade in the default portfolio because that's where money transfers go by default; which, means the funds could get swept up by the bot before you can allocate them where you want. Create a new portfolio for each bot you want to run, for example you could create one called "BTC trader" that the bot trades bitcoin inside of. If you wish to use the feature that deposits all or a portion of profits into another portfolio to save it then by default those deposits will go to the default portfolio, but you have the option to create a different portfolio to use instead. Take note of the profile names you created as you will need them in steps 5 & 6.
3. Create the API key for the portfolio you want the bot to trade on, give it View/Trade/Transfer permissions and whitelist your public IP. [More info here](https://help.coinbase.com/en/pro/other-topics/api/how-do-i-create-an-api-key-for-coinbase-pro). 
4. Clone the github repo locally and run `npm install` from within the repo directory.
5. Configure the variables at the top of ../Strategies/MomentumTrading/momentumTrading.js to select your Deltas, product to trade,Profile Names etc.  DO NOT ADD YOUR API INFORMATION HERE. You will use your API information in Step 6. The variables can also be added to the .env file instead of directly edited in code.
6. Create a .env file in the root directory of the projects repo with the following:

    API_KEY=\<your API key>

    API_SECRET=\<your API secret>

    API_PASSPHRASE=\<your API passphrase>

    TRADING_ENV=\<real> Leaving this out defaults to sandbox environment

    Additionally consider adding `LOG_LEVEL=debug` here if you want the full debug logs.

    All of the the trading variables can be configured in the code or in the .env below is a list of these variables:

    SELL_POSITION_DELTA=\<decimal value>

    BUY_POSITION_DELTA=\<decimal value>

    ORDER_PRICE_DELTA=\<decimal value>

    BASE_CURRENCY_NAME=\<string>

    QUOTE_CURRENCY_NAME=\<string>

    TRADING_PROFILE_NAME=\<string>

    DEPOSIT_PROFILE_NAME=\<string>

    DEPOSITING_ENABLED=\<bool>

    DEPOSITING_AMOUNT=\<decimal from 1 to 0>

    BALANCE_MINIMUM=\<decimal>

7. Add some funds to your default portfolio and make sure there is no existing coin balance for the product you're trading if you're just starting the bot. See "Restarting the bot" if you want the bot to pick up where it left off after stopping it.
8. Run the program with `node index.js` from within the repo directory.

### Restarting the bot:
If at any point the bot stops running for any reason, the the bot keeps a file called positionData.json that tracks whether or not it was in a position, and the information associated with that position. If you restart the bot it will read that file and automatically pick up where it left off. Don't try to add more coins to the existing position or it will cause unexpected behavior since the bot won't know the associated costs with the newly added coin. You can, at any point, add USD to a portfolio, the bot will start trading with the newly added USD when it completes a buy/sell cycle. If you want to start the bot fresh without existing data, simply make sure there is no left over coin in your profile and delete the positionData.json file.

The positionData.json file contains a JSON object with 3 fields, positionExists (boolean), positionAcquiredPrice (Number), positionAcquiredCost (Number).

Example of a position existing positionData.json file:
{"positionExists":true,"positionAcquiredPrice":48560.00000000001,"positionAcquiredCost":274.66836873840003}

Example of a position not existing positionData.json file:
{"positionExists":false,"positionAcquiredPrice":228.69000000000003,"positionAcquiredCost":299.85119860983207}

Notice that the position acquired cost and price fields still exist in the file when positionExists is false, but they are ignored.

## How to contribute:
1. Fork the repo.
2. Clone the github repo locally and run `npm install` 
3. Create a new branch with a name that describes the feature/change you're making.
4. Check the road map for ideas of things to work on.
5. Make your changes and commit them with a descriptive message.
6. Push your changes upstream.
7. When you're done testing your changes, create a pull request to merge your repository into LeviathanLevi/Coinbase-Pro-Crypto-Trading-Bot-CrypFinder. Then wait for approval.

## Running the program out of sandbox:
When you're confident in the configuration/code base and want to run it in the real environment, comment out the sandbox env variables and uncomment out the real API URI variables. Update the .env file with a valid API key. You can run this program on your own machine or consider using a server such as an AWS EC2 instance with an EIP (you need to whitelist the API IP). AWS EC2 offers a free tier instance for a year that works well for hosting.

## Momentum and reverse momentum trading strategy analyzer:
The analyzers are a way to run data against the bot strategy to see how well it performs. It takes in a .csv file with OHLC data. Carston Klein has already compiled a massive dataset that is perfect for this task and it's available for free on Kaggle [check it out](https://www.kaggle.com/tencars/392-crypto-currency-pairs-at-minute-resolution?select=ampusd.csv). After downloading the file for the coin data you want, just trim the .csv file to the length of time you want to test and run the analyzer with the configuration you want and it will generate a report showing how it did. He also wrote [this article](https://medium.com/coinmonks/how-to-get-historical-crypto-currency-data-954062d40d2d) on how to get similar data yourself.

## Helpful links:
[Coinbase Pro](https://pro.coinbase.com/trade/BTC-USD)

[Coinbase Pro API Docs](https://docs.pro.coinbase.com/#introduction)

[Coinbase Pro NodeJS Library](https://www.npmjs.com/package/coinbase-pro)

## Road map: 
### Possible future goals:
- Add a way to back test the momentumTradingWithStopLoss trading strategy

## Interested in the project?:
Consider getting involved. Feel free to contact the creator on GitHub ([Levi Leuthold](https://github.com/LeviathanLevi)) for information on how to get started! Checkout the product road map to see what features are currently planned for the future or add your own ideas. 