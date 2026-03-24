export interface BrandConfig {
  primary: string;
  secondary: string;
  text: string;
  fontFamily: string;
  logoFile: string | null;
}

export const DEFAULT_BRAND: BrandConfig = {
  primary: '#6C5CE7',
  secondary: '#A29BFE',
  text: '#FFFFFF',
  fontFamily: 'Inter, Helvetica Neue, Arial, sans-serif',
  logoFile: null,
};
