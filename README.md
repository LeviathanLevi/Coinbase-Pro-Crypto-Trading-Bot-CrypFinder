# CrypFinder Bot 
## Version 1.06

## CrypFinder Summary: 
CrypFinder is a Coinbase Pro API trading bot that implements a basic momentum trading strategy in NodeJS using the Coinbase Pro API. The bot will start by getting the amount of USD available for the provided API key's profile. If the amount is greater than 0 it will monitor the price changes of the BTC-USD product (could be modified to trade other products such as ETH, XRP, etc) using a peak/valley system if the price changes by the specified delta it will purchase a position. Then it will monitor price changes until the delta condition is met and profit condition, after selling for a profit it will transfer 40% to the associated Coinbase USD wallet and reinvest the other 60% and repeat the trading process.

## How to contribute:
I sugguest starting by using this program in the [Coinbase Pro Sandbox](https://docs.pro.coinbase.com/#sandbox). 
1. Create a coinbase pro account, and create an API key for the default portfolio (make sure to whitelist your public IP). 
2. Clone the github repo locally and run `npm install`
3. Create a .env file with the following:

    API_KEY=\<your API key>

    API_SECRET=\<your API secret>

    API_PASSPHRASE=\<your API passphrase>
4. Add some funds (USD) to your default portfolio, and make sure there is no existing coin balance for the product you're trading.
5. run the program with `node index.js`
6. Make you're changes and commit/push them!

## Running the program out of sandbox:
When you're confident in the code base and want to run it in the real enviornment then comment out the sandbox env variables and uncomment out the real env variables. You can run this program on your own machine or consider using something like an AWS EC2 instance with an EIP (you need to whitelist the API IP). Also be sure you understand the code and have done adequate testing before running this bot with real money (you're responsible for any losses 😃).

## Helpful links:
[Coinbase Pro](https://pro.coinbase.com/trade/BTC-USD)

[Coinbase Pro Docs](https://docs.pro.coinbase.com/#introduction)

[Coinbase Pro NodeJS Library](https://www.npmjs.com/package/coinbase-pro)

[Flow diagram (May be slightly outdated but can help to give an idea of the how the program works)](https://drive.google.com/file/d/1sMg7nWcuCDwHS5wdwHgoe5qqODO7UEFA/view?usp=sharing)

## Contributors:
Levi Leuthold - Creator, feel free to contact me for help or more information