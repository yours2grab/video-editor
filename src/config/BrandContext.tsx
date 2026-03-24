import React, {createContext, useContext} from 'react';
import type {BrandConfig} from './brand';
import {DEFAULT_BRAND} from './brand';

const BrandContext = createContext<BrandConfig>(DEFAULT_BRAND);

export const BrandProvider: React.FC<{
  config: BrandConfig;
  children: React.ReactNode;
}> = ({config, children}) => {
  return <BrandContext.Provider value={config}>{children}</BrandContext.Provider>;
};

export const useBrand = (): BrandConfig => {
  return useContext(BrandContext);
};
