/*
*   This module contains methods to buy a position and sell a position. It uses a limit order then loops checking the order
*   status until the order either completes, OR after 1 minute it will cancel the order.
*/
const pino = require("pino");
const logger = pino({ level: process.env.LOG_LEVEL || "info" });
const fileSystem = require("fs");

/**
 * Halts the program from running temporarily to prevent it from hitting API call limits
 * 
 * @param {number} ms -> the number of miliseconds to wait 
 */
function sleep(ms) {
    return new Promise((resolve) => {
        setTimeout(resolve, ms);
    });
}

/**
 * Places a sell limit order then loops to check the order status until the order is filled. Once filled, the method updates the positionInfo, does any depositing based on the 
 * depositConfig, then ends. If the Order is done for a reason other than filled, or a profit was not made then the method throws an exception. If the order doesn't get filled 
 * in the alloted time span (1 minute) then the method cancels the order and throws an exception.
 * 
 * @param {Number} balance 
 * @param {Object} accountIds 
 * @param {Object} positionInfo 
 * @param {Number} currentPrice 
 * @param {Object} authedClient 
 * @param {Object} coinbaseLibObject 
 * @param {Object} productInfo 
 * @param {Object} depositConfig 
 * @param {Object} tradingConfig 
 */
async function sellPosition(balance, accountIds, positionInfo, currentPrice, authedClient, coinbaseLibObject, productInfo, depositConfig, tradingConfig) {
    try {
        const priceToSell = (currentPrice - (currentPrice * tradingConfig.orderPriceDelta)).toFixed(productInfo.quoteIncrementRoundValue);

        let orderSize;
        if (productInfo.baseIncrementRoundValue === 0) {
            orderSize = Math.trunc(balance);
        } else {
            orderSize = (balance).toFixed(productInfo.baseIncrementRoundValue);
        }

        const orderParams = {
            side: "sell",
            price: priceToSell,
            size: orderSize,
            product_id: productInfo.productPair,
            time_in_force: "FOK"
        };

        logger.info("Sell order params: " + JSON.stringify(orderParams));

        //Place sell order
        const order = await authedClient.placeOrder(orderParams);
        logger.debug(order);
        const orderID = order.id;

        //Loop to wait for order to be filled:
        for (let i = 0; i < 100 && positionInfo.positionExists === true; ++i) {
            let orderDetails;
            logger.debug("Checking sell order result...");
            await sleep(6000); //wait 6 seconds
            try {
                orderDetails = await authedClient.getOrder(orderID); //Get latest order details
            } catch (err) {
                const message = "Error occured when attempting to get the order.";
                const errorMsg = new Error(err);
                logger.error({ message, errorMsg, err });
                continue;
            }
            logger.debug(orderDetails);

            if (orderDetails.status === "done") {
                if (orderDetails.done_reason !== "filled") {
                    throw new Error("Sell order did not complete due to being filled? done_reason: " + orderDetails.done_reason);
                } else {
                    positionInfo.positionExists = false;

                    //Update positionData file:
                    try {
                        const writeData = JSON.stringify(positionInfo);
                        fileSystem.writeFileSync("positionData.json", writeData);
                    } catch (err) {
                        const message = "Error, failed to write the positionInfo to the positionData file in sellPosition. Continuing as normal but but positionDataTracking might not work correctly.";
                        const errorMsg = new Error(err);
                        logger.error({ message, errorMsg, err });
                    }

                    let profit = parseFloat(orderDetails.executed_value) - parseFloat(orderDetails.fill_fees) - positionInfo.positionAcquiredCost;
                    logger.info("Profit: " + profit);

                    if (profit > 0) {
                        //Check deposit config:
                        if (depositConfig.depositingEnabled) {
                            const transferAmount = (profit * depositConfig.depositingAmount).toFixed(2);
                            const currency = productInfo.quoteCurrency;

                            //Transfer funds to depositProfileID
                            const transferResult = await coinbaseLibObject.profileTransfer(accountIds.tradeProfileID, accountIds.depositProfileID, currency, transferAmount);

                            logger.debug("transfer result: " + transferResult);
                        }
                    } else {
                        throw new Error("Sell was not profitable, terminating program. profit: " + profit);
                    }
                }
            }
        }

        //Check if order wasn't filled and needs cancelled:
        if (positionInfo.positionExists === true) {
            const cancelOrder = await authedClient.cancelOrder(orderID);
            if (cancelOrder !== orderID) {
                throw new Error("Attempted to cancel failed order but it did not work. cancelOrderReturn: " + cancelOrder + "orderID: " + orderID);
            }
        }

    } catch (err) {
        const message = "Error occurred in sellPosition method.";
        const errorMsg = new Error(err);
        logger.error({ message, errorMsg, err });
    }
}

/**
 * This method places a buy limit order and loops waiting for it to be filled. Once filled it will update the positionInfo and end. If the
 * order ends for a reason other then filled it will throw an exception. If the order doesn't get filled after 1 minute it will cancel the
 * order and throw an exception.
 * 
 * @param {Number} balance 
 * @param {Object} positionInfo 
 * @param {Number} currentPrice 
 * @param {Object} authedClient 
 * @param {Object} productInfo 
 * @param {Object} tradingConfig 
 */
async function buyPosition(balance, positionInfo, currentPrice, authedClient, productInfo, tradingConfig) {
    try {
        const amountToSpend = balance - (balance * tradingConfig.highestFee);
        const priceToBuy = (currentPrice + (currentPrice * tradingConfig.orderPriceDelta)).toFixed(productInfo.quoteIncrementRoundValue);
        let orderSize;

        if (productInfo.baseIncrementRoundValue === 0) {
            orderSize = Math.trunc(amountToSpend / priceToBuy);
        } else {
            orderSize = (amountToSpend / priceToBuy).toFixed(productInfo.baseIncrementRoundValue);
        }

        const orderParams = {
            side: "buy",
            price: priceToBuy,
            size: orderSize,
            product_id: productInfo.productPair,
            time_in_force: "FOK"
        };

        logger.info("Buy order params: " + JSON.stringify(orderParams));

        //Place buy order
        const order = await authedClient.placeOrder(orderParams);
        logger.debug(order);
        const orderID = order.id;

        //Loop to wait for order to be filled:
        for (let i = 0; i < 100 && positionInfo.positionExists === false; ++i) {
            let orderDetails;
            logger.debug("Checking buy order result...");
            await sleep(6000); //wait 6 seconds
            try {
                orderDetails = await authedClient.getOrder(orderID); //Get latest order details
            } catch (err) {
                const message = "Error occured when attempting to get the order.";
                const errorMsg = new Error(err);
                logger.error({ message, errorMsg, err });
                continue;
            }
            logger.debug(orderDetails);

            if (orderDetails.status === "done") {
                if (orderDetails.done_reason !== "filled") {
                    throw new Error("Buy order did not complete due to being filled? done_reason: " + orderDetails.done_reason);
                } else {
                    //Update position info
                    positionInfo.positionExists = true;
                    positionInfo.positionAcquiredPrice = parseFloat(orderDetails.executed_value) / parseFloat(orderDetails.filled_size);
                    positionInfo.positionAcquiredCost = parseFloat(orderDetails.executed_value) + parseFloat(orderDetails.fill_fees);

                    //Update positionData file:
                    try {
                        const writeData = JSON.stringify(positionInfo);
                        fileSystem.writeFileSync("positionData.json", writeData);
                    } catch (err) {
                        const message = "Error, failed to write the positionInfo to the positionData file in buyPosition. Continuing as normal but but positionDataTracking might not work correctly.";
                        const errorMsg = new Error(err);
                        logger.error({ message, errorMsg, err });
                    }

                    logger.info(positionInfo);
                }
            }
        }

        //Check if order wasn't filled and needs cancelled
        if (positionInfo.positionExists === false) {
            const cancelOrder = await authedClient.cancelOrder(orderID);
            if (cancelOrder !== orderID) {
                throw new Error("Attempted to cancel failed order but it did not work. cancelOrderReturn: " + cancelOrder + "orderID: " + orderID);
            }
        }

    } catch (err) {
        const message = "Error occurred in buyPosition method.";
        const errorMsg = new Error(err);
        logger.error({ message, errorMsg, err });
    }
}

module.exports = {
    sellPosition,
    buyPosition,
}