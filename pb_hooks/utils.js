const COLLECTIONS = {
  INVOICE: "Invoice",
  PINVOICE: "ProductInvoice",
  DELIVERY: "Delivery",
  CHECK: "Check",
  BCUSTOMERS: "Basic_Customer",
};

const ALLOWED_TYPES = {
  INVOICE: "Invoice",
  DELIVERY: "Delivery",
  CHECK: "Check",
};

// Define user roles
const ROLES = {
  CASHIER: "Cashier",
  KIOSK: "Kiosk",
  REGISTER: "Register",
};

// Define invoice statuses
const STATUS = {
  OPEN: "Open",
  CLOSED: "Closed",
  PENDING: "Pending",
};

function createProductRecords(products, invoiceId, prodInvoiceCollection) {
  return products.map((prod) => {
    const productRecord = new Record(prodInvoiceCollection);
    console.log(productRecord);
    productRecord.load({
      base_product: prod.product, // ID of the base product
      associated_invoice: invoiceId, // Reference to the invoice ID
      complements: prod.complements, // Any complements associated with the product
      quantity: prod.quantity, // Quantity of the product
      composed_value: prod.composed_value, // Total value considering complements
    });
    return productRecord;
  });
}

function createInvoiceRecord(data, invoiceCollection) {
    const invoiceRecord = new Record(invoiceCollection);
    invoiceRecord.load(data); // Load data into the record
    return invoiceRecord;
  }

module.exports = {
  COLLECTIONS,
  ALLOWED_TYPES,
  ROLES,
  STATUS,
  createProductRecords,
  createInvoiceRecord,
};
