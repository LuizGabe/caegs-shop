export type PaymentCustomer = {
  id: string;
  name: string;
  email: string;
  cpfCnpj: string;
};

export type CreatePixPaymentInput = {
  externalReference: string;
  customer: PaymentCustomer;
  amount: number;
  description: string;
  dueDate: string;
};

export type PixPayment = {
  providerCustomerId: string;
  providerPaymentId: string;
  status: string;
};

export type PixQrCode = {
  encodedImage: string;
  payload: string;
  expirationDate: string | null;
};

export interface PaymentProvider {
  createPixPayment(input: CreatePixPaymentInput): Promise<PixPayment>;
  getPixQrCode(providerPaymentId: string): Promise<PixQrCode>;
}
