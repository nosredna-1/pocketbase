// Define a GET endpoint for "/users"
routerAdd("GET", "/users", (c) => {
  // Return a JSON response with the roles from the query parameters
  return c.json(200, { message: "ok:" + $apis.requestInfo(c).query.roles });
});

// Define a POST endpoint for "/billing/:type"
routerAdd(
  "POST",
  "/billing/:type",
  (c) => {
    // Function to create an invoice record
    function createInvoiceRecord(data, invoiceCollection) {
      const invoiceRecord = new Record(invoiceCollection);
      invoiceRecord.load(data); // Load data into the record
      return invoiceRecord;
    }

    // Function to create product records associated with the invoice
    function createProductRecords(products, invoiceId, prodInvoiceCollection) {
      return products.map((prod) => {
        const productRecord = new Record(prodInvoiceCollection);
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

    // Shortcut function to find collections by name or ID
    const $ = $app.dao().findCollectionByNameOrId;

    // Define collection names
    const collections = {
      INVOICE: "Invoice",
      PINVOICE: "ProductInvoice",
      DELIVERY: "Delivery",
      CHECK: "Check",
    };

    // Allowed types for the billing endpoint
    const allowedTypes = {
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

    try {
      const type = c.pathParam("type"); // Get the 'type' parameter from the path
      const req = $apis.requestInfo(c); // Get request information
      const data = req.data; // Get the request body data
      const authRecord = req.authRecord; // Get the authenticated user's record

      // Validate that the request body exists
      if (!data) {
        return c.json(400, { message: "No body available" });
      }

      // Validate that 'products' exists and is not empty
      if (!data.products || data.products.length < 1) {
        return c.json(400, {
          message:
            "Can't create an empty bill. 'products' shouldn't be empty or null.",
        });
      }

      // Get the necessary collections
      const prodInvoiceCollection = $(collections.PINVOICE);
      const invoiceCollection = $(collections.INVOICE);
      const deliveryCollection = $(collections.DELIVERY);

      let invoiceId = ""; // Variable to store the created invoice ID
      // Get the user's roles
      const roles = authRecord.get("roles");

      // Determine the invoice status based on user roles
      const status = roles?.includes(ROLES.REGISTER)
        ? STATUS.CLOSED
        : STATUS.OPEN;

      // Run database operations within a transaction
      $app.dao().runInTransaction((txDao) => {
        // Create and save the invoice record
        const invoiceRecord = createInvoiceRecord(
          { ...data, status },
          invoiceCollection
        );
        txDao.saveRecord(invoiceRecord);
        invoiceId = invoiceRecord.id;

        // If the invoice is closed, create and save product records associated with the invoice
        if (status === STATUS.CLOSED || type === allowedTypes.INVOICE) {
          const productRecords = createProductRecords(
            data.products,
            invoiceId,
            prodInvoiceCollection
          );
          productRecords.forEach((productRecord) => {
            txDao.saveRecord(productRecord);
          });
        }

        let child_record = null; // Variable to hold a child record if needed

        // Handle additional actions based on the 'type' parameter
        switch (type) {
          case allowedTypes.CHECK:
            // Logic for 'Check' type can be implemented here
            break;
          case allowedTypes.DELIVERY:
            // Create a delivery record associated with the invoice
            child_record = new Record(deliveryCollection);
            child_record.load({
              associated_invoice: invoiceId,
              ...data.delivery, // Spread delivery-specific data
              status,
              products: data.products,
            });
            break;
          case allowedTypes.INVOICE:
            // No additional action needed for 'Invoice' type
            break;
          default:
            // If the 'type' is not recognized, throw an error
            throw new Error(`Invalid billing type: ${type}`);
        }

        // Save the child record if it was created
        if (child_record !== null) {
          if (status === STATUS.OPEN) invoiceId = child_record.id;
          txDao.saveRecord(child_record);
        }
      });

      // Return a success response with the invoice ID
      return c.json(200, {
        message:
          status === STATUS.CLOSED
            ? "Bill created successfully"
            : "Delivery created successfully",
        type: status === STATUS.CLOSED ? "Invoice" : "Delivery",
        id: invoiceId,
      });
    } catch (error) {
      // Return an error response with the error message
      return c.json(500, {
        message: "Internal Server Error",
        error: error.message,
      });
    }
  },
  $apis.requireAdminOrRecordAuth()
);

// Define a GET endpoint for "/status"
routerAdd("GET", "/status", (c) => {
  const search = c.queryParam("message"); // Get the 'message' query parameter
  // Return a JSON response with "Ok" and the message if provided
  return c.json(200, { message: "Ok" + (search ? ": " + search : "") });
});

routerAdd(
  "POST",
  "/deliveries",
  (c) => {
    const req = $apis.requestInfo(c); // Get request information
    const data = req.data; // Get the request body data
    const authRecord = req.authRecord; // Get the authenticated user's record
    const roles = authRecord.get("roles");
    if (!roles.includes("Register")) {
      return c.json(403, { message: "No tiene permisos para hacer esto" });
    }
    if (!data) {
      return c.json(400, { message: "No body available" });
    }
    if (!data.courier) {
      return c.json(400, { message: "Courier is required" });
    }
    if (!data.deliveries || data.deliveries.length < 1) {
      return c.json(400, {
        message:
          "Can't process an empty list. 'deliveries' shouldn't be empty or null.",
      });
    }

    // Function to create product records associated with the invoice
    function createProductRecords(products, invoiceId, prodInvoiceCollection) {
      return products.map((prod) => {
        const productRecord = new Record(prodInvoiceCollection);
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

    const collections = {
      INVOICE: "Invoice",
      PINVOICE: "ProductInvoice",
      DELIVERY: "Delivery",
      CHECK: "Check",
    };
    $app.dao().runInTransaction((txDao) => {
      data.deliveries.forEach((delivery) => {
        const deliveryRecord = $app
          .dao()
          .findRecordById(collections.DELIVERY, delivery.id);
        if (!deliveryRecord) {
          return c.json(404, {
            message: `Delivery with ID ${delivery.id} not found`,
          });
        }
        const productRecords = createProductRecords(
          delivery.products,
          deliveryRecord.get("associated_invoice"),
          $app.dao().findCollectionByNameOrId(collections.PINVOICE)
        );
        productRecords.forEach((productRecord) => {
          txDao.saveRecord(productRecord);
        });
        deliveryRecord.set("status", "Closed");
        deliveryRecord.set("courier", data.courier);
        txDao.saveRecord(deliveryRecord);
      });
    });

    return c.json(200, { message: "Ok" });
  },
  $apis.requireAdminOrRecordAuth()
);
