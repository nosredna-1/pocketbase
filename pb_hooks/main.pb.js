// $app.rootCmd.addCommand(
//   new Command({
//     use: "test",
//     run: (cmd, args) => {
//       const utils = require(`${__hooks}/utils.js`);
//       // const date = new Date();
//       const date = new Date("2024/11/17");

//       date.setDate(date.getDate() - 1);
//       date.setHours(1, 0, 0); // Set the time to 6:00 AM GMT-5
//       const filterDate = date.toISOString().split("T").join(" ");

//       console.log(filterDate);

//       const records = $app.dao().findRecordsByFilter(
//         utils.COLLECTIONS.DELIVERY, // collection
//         `status ~ "${utils.STATUS.PENDING}" && created >= "${filterDate}"` // where
//         // "created" // sort
//       );
//       const save = $app.dao().saveRecord;
//       records.forEach((record) => {
//         record.set("status", utils.STATUS.OPEN);
//         save(record);
//         console.log(record.get("created"));
//       });
//       console.log(JSON.stringify(records.length));
//     },
//   })
// );

cronAdd("automark-deliveries", "0 10 * * *", () => {
  const utils = require(`${__hooks}/utils.js`);
  const date = new Date();

  date.setDate(date.getDate() - 1);
  date.setHours(1, 0, 0); // Set the time to 6:00 AM GMT-5
  const filterDate = date.toISOString().split("T").join(" ");

  console.log("running cronjob, mark-deliveries", filterDate);

  const records = $app.dao().findRecordsByFilter(
    utils.COLLECTIONS.DELIVERY, // collection
    `status ~ "${utils.STATUS.OPEN}" && created >= "${filterDate}"` // where
    // "created" // sort
  );
  const save = $app.dao().saveRecord;
  records.forEach((record) => {
    record.set("status", utils.STATUS.PENDING);
    save(record);
  });
});

routerAdd("GET", "health", (c) => {
  return c.json(200, { message: "OK, service working" });
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
    const utils = require(`${__hooks}/utils.js`);
    const createProductRecords = utils.createProductRecords;

    // Shortcut function to find collections by name or ID
    const $ = $app.dao().findCollectionByNameOrId;
    // Define collection names
    const collections = utils.COLLECTIONS;

    // Allowed types for the billing endpoint
    const allowedTypes = utils.ALLOWED_TYPES;

    // Define user roles
    const ROLES = utils.ROLES;
    // Define invoice statuses
    const STATUS = utils.STATUS;

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
      const bcustomerCollection = $(collections.BCUSTOMERS);
      const checkCollection = $(collections.CHECK);

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
          case allowedTypes.DELIVERY:
            // Create a delivery record associated with the invoice
            child_record = new Record(deliveryCollection);
            child_record.load({
              associated_invoice: invoiceId,
              ...data.delivery, // Spread delivery-specific data
              status,
              products: data.products,
            });
            console.log(
              JSON.stringify(data.delivery),
              "collection",
              collections.BCUSTOMERS
            );
            const userRecord = $app
              .dao()
              .findRecordById(
                "Basic_Customer",
                ('3125671610').toString()
              );
            console.log(JSON.stringify(userRecord), "is it something?");
            console.log(
              "Seeking customer by phone number",
              data.delivery.customer_phone
            );
            if (!userRecord) {
              console.log("non existent user", data.delivery.customer_phone);

              const customerRecord = new Record(bcustomerCollection);
              customerRecord.load({
                id: data.delivery.customer_phone, // ID of the customer, by the moment should be the phone_number
                address: data.delivery.address,
                phone: data.delivery.customer_phone,
                lat: data.delivery.lat,
                lng: data.delivery.lng,
                neigborhood: data.delivery.neighborhood,
                charge: data.delivery.charge,
              });
              console.log("record created, ready to save");
              txDao.saveRecord(customerRecord);
              console.log("record saved");
            } else {
              console.log(JSON.stringify(userRecord));
            }

            break;
          case allowedTypes.INVOICE:
            // No additional action needed for 'Invoice' type
            break;
          case allowedTypes.CHECK:
            child_record = new Record();
            child_record.load({
              associated_invoice: invoiceId,
              ...data.delivery, // Spread delivery-specific data
              status,
              products: data.products,
            });
            // Logic for 'Check' type can be implemented here
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

    const utils = require(`${__hooks}/utils.js`);
    const createProductRecords = utils.createProductRecords;

    const collections = utils.COLLECTIONS;

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
