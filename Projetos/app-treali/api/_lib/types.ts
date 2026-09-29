export type DistributorAccount = {
  id: string;
  email: string;
  passwordHash: string;
  label: string;
  cityId: string;
  citySlug: string;
};

export type SessionClaims = {
  distributorId: string;
  cityId: string;
  citySlug: string;
  label: string;
  expiresAt: number;
};

export type CatalogClient = {
  id: string;
  name: string;
  tradeName?: string;
  cityId: string;
  citySlug: string;
  address?: string;
  phone?: string;
};
