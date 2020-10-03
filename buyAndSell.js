/**
 * Halts the program from running temporarily to prevent it from hitting API call limits
 */
function sleep(ms) {
    return new Promise((resolve) => {
        setTimeout(resolve, ms);
    });
} 

/**
 * Place a limit order to sell the btc, loop until the order goes through successfully or cancel it and try again if it doesn't.
 * 
 * @param {*} btcSize 
 * @param {*} accountIds 
 * @param {*} updatedPositionInfo 
 * @param {*} currentPrice 
 * @param {*} orderPriceDelta 
 * @param {*} authedClient 
 */
async function sellPosition(btcSize, accountIds, updatedPositionInfo, currentPrice, orderPriceDelta, authedClient, coinbaseLibObject) {
    const priceToSell = currentPrice - (currentPrice * orderPriceDelta);

    const orderParams = {
        side: "sell",
        price: priceToSell.toFixed(2), 
        size: btcSize.toFixed(8),
        product_id: "BTC-USD",
    };

    const order = await authedClient.placeOrder(orderParams);
    const orderID = order.id;

    for (let i = 0; i < 10 && updatedPositionInfo.positionExists === true; ++i) {
        await sleep(6000);
        const orderDetails = await authedClient.getOrder(orderID);

        if (orderDetails.status === "done") {
            if (orderDetails.done_reason !== "filled") {
                throw new Error("Sell order did not complete due to being filled? done_reason: " + orderDetails.done_reason);
            } else {
                updatedPositionInfo.positionExists = false;

                let profit = parseFloat(orderDetails.executed_value) - parseFloat(orderDetails.fill_fees) - updatedPositionInfo.positionAcquiredCost;

                if (profit > 0) {
                    const transferAmount = (profit * .4).toFixed(2);
                    const currency = "USD";

                    //transfer funds to depositProfileID
                    const transferResult = await coinbaseLibObject.profileTransfer(accountIds.tradeProfileID, accountIds.depositProfileID, currency, transferAmount);
                    
                    console.log(transferResult);
                } else {
                    throw new Error("Sell was not profitable, terminating program. profit: " + profit);
                }
            }
        }

        if (updatedPositionInfo.positionExists === true) {
            const cancelOrder = await authedClient.cancelOrder(orderID);
            if (cancelOrder !== orderID) {
                throw new Error("Attempted to cancel failed order but it did not work. cancelOrderReturn: " + cancelOrder + "orderID: " + orderID);
            }
        }
    }
}

/**
 * Attempt to buy a position with a limit order, loop until the order goes through successfully or cancel it and try again if it doesn't.
 */
async function buyPosition(usdBalance, updatedPositionInfo, takerFee, currentPrice, orderPriceDelta, authedClient) {
    const amountToSpend = usdBalance - (usdBalance * takerFee);
    const priceToBuy = currentPrice + (currentPrice * orderPriceDelta);
    const orderSize = amountToSpend / priceToBuy;

    const orderParams = {
        side: "buy",
        price: priceToBuy.toFixed(2), 
        size: orderSize.toFixed(8), 
        product_id: "BTC-USD",
    };

    const order = await authedClient.placeOrder(orderParams);
    const orderID = order.id;

    for (let i = 0; i < 10 && updatedPositionInfo.positionExists === false; ++i) {
        await sleep(6000);
        const orderDetails = await authedClient.getOrder(orderID);

        if (orderDetails.status === "done") {
            if (orderDetails.done_reason !== "filled") {
                throw new Error("Buy order did not complete due to being filled? done_reason: " + orderDetails.done_reason);
            } else {
                updatedPositionInfo.positionExists = true;
                updatedPositionInfo.positionAcquiredPrice = parseFloat(orderDetails.executed_value) / parseFloat(orderDetails.filled_size);
                updatedPositionInfo.positionAcquiredCost = parseFloat(orderDetails.executed_value)  + parseFloat(orderDetails.fill_fees);
            }
        }
    }

    if (updatedPositionInfo.positionExists === false) {
        const cancelOrder = await authedClient.cancelOrder(orderID);
        if (cancelOrder !== orderID) {
            throw new Error("Attempted to cancel failed order but it did not work. cancelOrderReturn: " + cancelOrder + "orderID: " + orderID);
        }
    }
}

module.exports = {
    sellPosition,
    buyPosition,
}