# Momentum Trading Strategy 

## Summary: 
This trading strategy works specifying a buy and sell delta. When the bot starts it waits for the buy delta condition to be reached. Say for example the buy delta is 2%, once the price rises to meet that delta then the bot will trigger a buy in. The idea behind momentum trading is that when the price goes up there's momentum that will continue to rise up. The Sell delta price is the opposite of the buy, where when the price drops by that amount it will sell out.
Additionally this strategy will automatically sell and reset if the price falls below a set percentage of the original buy.
