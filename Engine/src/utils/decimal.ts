const STANDARD_DECIMALS = 8;

export const toStandardDecimals = (value : number, currentDecimals : number ) : bigint => {
    if(currentDecimals > STANDARD_DECIMALS) {
        const divisor = Math.pow(10, currentDecimals - STANDARD_DECIMALS);
        return BigInt(Math.floor(value / divisor));
    }else{
        const multiplier = Math.pow(10, STANDARD_DECIMALS - currentDecimals);
        return BigInt(value) * BigInt(multiplier);
    }
};

export const fromStandardDecimals = (value : bigint, targetDecimals : number) : number => {
    if(targetDecimals > STANDARD_DECIMALS) {
        const multiplier = Math.pow(10, targetDecimals - STANDARD_DECIMALS);
        return Number(value) * multiplier;
    }else{
        const divisor = BigInt(Math.pow(10, STANDARD_DECIMALS - targetDecimals));
        return Number(value/divisor);
    }
};

export const multiply = (value1 : number, decimals1: number, value2: number, decimals2: number, resultDecimals: number) : number => {
    const standardValue1 = toStandardDecimals(value1, decimals1);
    const standardValue2 = toStandardDecimals(value2, decimals2);
    const result = (standardValue1 * standardValue2) / BigInt(Math.pow(10, STANDARD_DECIMALS));
    return fromStandardDecimals(result, resultDecimals);
}

export const subtract = (value1: number, decimals1: number, value2: number, decimals2: number, resultDecimals: number): number => {
  const standardValue1 = toStandardDecimals(value1, decimals1);
  const standardValue2 = toStandardDecimals(value2, decimals2);
  const result = standardValue1 - standardValue2;
  return fromStandardDecimals(result, resultDecimals);
};

export const calculatePositionValue = (margin: number, leverage: number, price: number, priceDecimals: number): { positionValueInStandard: bigint, positionSizeInAsset: number } => {
  const MARGIN_DECIMALS = 2;
  const LEVERAGE_DECIMALS = 0; 
  
  const standardMargin = toStandardDecimals(margin, MARGIN_DECIMALS);
  const standardLeverage = toStandardDecimals(leverage, LEVERAGE_DECIMALS);
  const standardPrice = toStandardDecimals(price, priceDecimals);

  const positionValueInStandard = (standardMargin * standardLeverage) / BigInt(Math.pow(10, STANDARD_DECIMALS));

  const positionSizeInAsset = Math.round(Number(positionValueInStandard) / Number(standardPrice) * Math.pow(10, priceDecimals));
  
  return {
    positionValueInStandard,
    positionSizeInAsset
  };
};

export const convertDecimals = (value: number, fromDecimals: number, toDecimals: number): number => {
  if (fromDecimals === toDecimals) return value;
  
  if (fromDecimals > toDecimals) {
    const divisor = Math.pow(10, fromDecimals - toDecimals);
    return Math.floor(value / divisor);
  } else {
    const multiplier = Math.pow(10, toDecimals - fromDecimals);
    return value * multiplier;
  }
};


