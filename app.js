    require("dotenv").config();
    const express = require("express");
    const bodyParser = require("body-parser");
    const ejs = require("ejs");
    const { MongoClient, ObjectId } = require("mongodb");
    const session = require("express-session");
    const passport = require("passport");
    const LocalStrategy = require("passport-local").Strategy;
    const GoogleStrategy = require("passport-google-oauth20").Strategy;
    const FacebookStrategy = require("passport-facebook").Strategy;

    const app = express();
    app.use(express.static("public"));

    app.set("view engine", "ejs");

    app.use(bodyParser.urlencoded({ extended: true }));
    app.use(
    session({
        secret: process.env.SESSION_SECRET,
        resave: false,
        saveUninitialized: false,
    })
    );

    app.use(passport.initialize());
    app.use(passport.session());

    const uri = process.env.MONGODB_URI;
    const client = new MongoClient(uri);

    async function connectToMongo() {
        try {
            await client.connect();
            console.log("Connected to MongoDB");
            
            // Initialize collections after successful connection
            const db = client.db();
            app.locals.Product = db.collection("products");
            app.locals.User = db.collection("users");
        } catch (err) {
            console.error(err);
            process.exit(1);
        }
    }
    

    connectToMongo();

    passport.use(
        new LocalStrategy(async function (username, password, done) {
            try {
                const usersCollection = app.locals.User;
                const user = await usersCollection.findOne({ username: username });
                if (!user) {
                    return done(null, false, { message: "Incorrect username." });
                }
                if (user.password !== password) {
                    return done(null, false, { message: "Incorrect password." });
                }
                return done(null, user);
            } catch (err) {
                return done(err);
            }
        })
    );

    passport.serializeUser(function(user, done) {
        try {
            // Assuming user._id is the unique identifier
            done(null, user._id.toString());
        } catch (err) {
            done(err);
        }
    });
    
    
    passport.deserializeUser(async function(id, done) {
        try {
            const usersCollection = client.db().collection("users");
            const user = await usersCollection.findOne({ _id: new ObjectId(id) }); // Instantiate ObjectId with 'new'
            done(null, user);
        } catch (err) {
            done(err);
        }
    });

    
    passport.use(
        new GoogleStrategy(
            {
                clientID: process.env.GOOGLE_CLIENT_ID,
                clientSecret: process.env.GOOGLE_CLIENT_SECRET,
                callbackURL: "https://amaze-kart-uf6d.onrender.com/auth/google/cart",
            },
            async function (accessToken, refreshToken, profile, cb) {
                try {
                    const usersCollection = client.db().collection("users");
                    let user = await usersCollection.findOne({ googleId: profile.id });
                    if (user) {
                        return cb(null, user);
                    } else {
                        const result = await usersCollection.insertOne({ googleId: profile.id, username: profile.displayName });
                        if (result.ops && result.ops.length > 0) {
                            user = result.ops[0];
                            return cb(null, user);
                        } else {
                            return cb(null, false, { message: "Please register first." });
                        }
                    }
                } catch (err) {
                    return cb(err);
                }
            }
        )
    );
    
    
    passport.use(
        new FacebookStrategy(
            {
                clientID: process.env.FACEBOOK_APP_ID,
                clientSecret: process.env.FACEBOOK_APP_SECRET,
                callbackURL: "https://amaze-kart-uf6d.onrender.com/auth/facebook/cart",
            },
            async function (accessToken, refreshToken, profile, cb) {
                try {
                    const usersCollection = client.db().collection("users");
                    let user = await usersCollection.findOne({ facebookId: profile.id });
                    if (user) {
                        return cb(null, user);
                    } else {
                        const result = await usersCollection.insertOne({ facebookId: profile.id, username: profile.displayName });
                        if (result.ops && result.ops.length > 0) {
                            user = result.ops[0];
                            return cb(null, user);
                        } else {
                            return cb(null, false, { message: "Please register first." });
                        }
                    }
                } catch (err) {
                    return cb(err);
                }
            }
        )
    );
    
    
    async function connectToMongo() {
        try {
            await client.connect();
            console.log("Connected to MongoDB");
            const db = client.db();
            app.locals.Product = db.collection("products");
            app.locals.User = db.collection("users");
        } catch (err) {
            console.error(err);
            process.exit(1);
        }
    }
    

    // Homepage route
    app.get("/", function (req, res) {
    res.render("homepage");
    });

    app.post("/", async function (req, res) {
        try {
            const searchTerm = req.body.search_bar.trim();
            console.log(searchTerm);
    
            // Using $regex to find documents where the 'name' field contains the substring
            const foundProducts = await app.locals.Product.find({ name: { $regex: searchTerm, $options: 'i' } }).toArray();
    
            if (foundProducts.length > 0) {
                console.log(foundProducts);
                res.render("products", { products: foundProducts });
            } else {
                const message = "No products found!";
                res.render("message", { message: message });
            }
        } catch (err) {
            console.error(err);
            res.status(500).send("Internal Server Error");
        }
    });
    

    app.get("/products/:productname", async function(req, res) {
        try {
            const productname = req.params.productname;
            
            // Retrieve the product with the specified name
            const foundProduct = await app.locals.Product.findOne({ name: productname });
    
            if (foundProduct) {
                res.render("product", { specificProduct: foundProduct });
            } else {
                // If no product is found, render a message
                const message = "Product not found!";
                res.render("message", { message: message });
            }
        } catch (err) {
            // Handle any errors that occur during the database query
            console.error(err);
            res.status(500).send("Internal Server Error");
        }
    });
    


    // Google authentication route
    app.get(
    "/auth/google",
    passport.authenticate("google", { scope: ["profile"] })
    );

    // Google callback route
    app.get( '/auth/google/cart',
        passport.authenticate( 'google', {
            successRedirect: '/cart',
            failureRedirect: '/login'
    }));

    // Facebook authentication route
    app.get(
    "/auth/facebook",
    passport.authenticate("facebook")
    );

    // Facebook callback route
    app.get(
    "/auth/facebook/cart",
    passport.authenticate("facebook", { failureRedirect: "/login" }),
    function (req, res) {
        res.redirect("/cart");
    }
    );

    app.get("/cart/:cartproductId", async function (req, res) {
        try {
            if (req.isAuthenticated()) {
                const cartproductId = req.params.cartproductId;
                const usernowUsername = req.user.username;
    
                console.log(usernowUsername);
        
                // Log the cartproductId for debugging
                console.log("Cart Product ID:", cartproductId);
        
                // Find the product with the specified ID
                const product = await app.locals.Product.findOne({ _id: new ObjectId(cartproductId) }).catch(err => {
                    console.error("Error finding product:", err);
                    res.status(500).send("Error finding product");
                });
    
                console.log(product);
                if (product) {
                    const foundUser = await app.locals.User.findOne({ username: usernowUsername });
                    console.log(foundUser);
        
                    if (foundUser) { // Check if foundUser exists
                        if (!foundUser.addedItems) {
                            foundUser.addedItems = []; // Initialize addedItems if it doesn't exist
                        }
    
                        let alreadyAddedItem = foundUser.addedItems.find(item => item._id.toString() === cartproductId);
                        
                        if (alreadyAddedItem) {
                            // If the product is already in the cart, increment the quantity
                            alreadyAddedItem.quantity++;
                        } else {
                            // If the product is not in the cart, add it with quantity 1
                            product.quantity = 1;
                            foundUser.addedItems.push(product);
                        }
    
                        // Update the user document in the database
                        await app.locals.User.updateOne({ username: usernowUsername }, { $set: { addedItems: foundUser.addedItems } });
        
                        res.redirect("/cart");
                    } else {
                        res.status(500).send("Error finding user");
                    }
                } else {
                    res.status(404).send("Product not found!");
                }
            } else {
                res.redirect("/login");
            }
        } catch (err) {
            console.error(err);
            res.status(500).send("Internal Server Error");
        }
    });
    
    
    
    
    
    app.get("/cart/remove/:cartproductId", async function (req, res) {
        try {
            const cartproductId = req.params.cartproductId;
            const usernowUsername = req.user.username;
    
            // Find the user document
            const foundUser = await app.locals.User.findOne({ username: usernowUsername });
    
            if (foundUser) {
                // Find the index of the product in the addedItems array
                const foundProductIndex = foundUser.addedItems.findIndex(item => item._id.toString() === cartproductId);
    
                if (foundProductIndex !== -1) {
                    if (foundUser.addedItems[foundProductIndex].quantity > 1) {
                        // If the quantity is greater than 1, decrement it
                        foundUser.addedItems[foundProductIndex].quantity--;
                    } else {
                        // If the quantity is 1, remove the item from the cart
                        foundUser.addedItems.splice(foundProductIndex, 1);
                    }
    
                    // Update the user document in the database
                    await app.locals.User.updateOne({ username: usernowUsername }, { $set: { addedItems: foundUser.addedItems } });
                }
            }
    
            res.redirect("/cart");
        } catch (err) {
            console.error(err);
            res.status(500).send("Internal Server Error");
        }
    });
    
    
    app.get("/cart", async function (req, res) {
        try {
            if (req.isAuthenticated()) {
                const foundUser = await app.locals.User.findOne({ username: req.user.username });
    
                if (foundUser && foundUser.addedItems) { // Check if foundUser and foundUser.addedItems are defined
                    const userCartedProducts = foundUser.addedItems.filter(item => item.quantity >= 1);
    
                    if (userCartedProducts.length > 0) {
                        res.render("cart", { cartProducts: userCartedProducts });
                    } else {
                        res.render("cartempty");
                    }
                } else {
                    res.render("cartempty"); // Render cart empty if foundUser or foundUser.addedItems is undefined
                }
            } else {
                res.redirect("/login");
            }
        } catch (err) {
            console.error(err);
            res.status(500).send("Internal Server Error");
        }
    });
    
        // Login route
app.get("/login", function (req, res) {
    if (req.isAuthenticated()) {
        const message = "You are already logged in!";
        res.render("message", { "message": message });
    } else {
        res.render("login");
    }
});

// Login form submission route
app.post("/login", async function (req, res) {
    try {
        passport.authenticate('local', async function (err, user, info) {
            if (err) {
                console.error(err);
                return res.status(500).send("Error logging in");
            }
            if (!user) {
                // Login failed - username or password incorrect
                return res.redirect("/login");
            }
    
            req.login(user, function (err) {
                if (err) {
                    console.error(err);
                    return res.status(500).send("Error logging in");
                }
                return res.redirect("/cart"); // Redirect to cart on successful login
            });
        })(req, res);
    } catch (err) {
        console.error(err);
        return res.status(500).send("Error logging in");
    }
});


// Registration route
app.get("/register", function (req, res) {
    if (req.isAuthenticated()) {
        const message = "You are already logged in!";
        res.render("message", { "message": message });
    } else {
        res.render("register");
    }
});

// Registration form submission route
app.post("/register", async function (req, res) {
    try {
        const newUser = {
            username: req.body.username,
            password: req.body.password, // Make sure to hash the password before storing it in production
            // Add other user properties if needed
        };

        const usersCollection = app.locals.User;

        // Check if the username is already taken
        const existingUser = await usersCollection.findOne({ username: newUser.username });
        if (existingUser) {
            return res.status(400).send("Username already exists");
        }

        // Insert the new user into the database
        const result = await usersCollection.insertOne(newUser);
        console.log(result);
        // Ensure that the insertOne operation is successful
        if (result.acknowledged){
            // Redirect the user to the login page after successful registration
            return res.redirect("/cart");
        } else {
            throw new Error("Error registering user: Insert operation failed or returned unexpected result.");
        }
    } catch (err) {
        console.error("Error registering user:", err);
        return res.status(500).send("Error registering user. Please try again later.");
    }
});


    app.get("/items/:category", async function(req, res) {
        const categoryName = req.params.category;
        
        try {
            const productsCollection = app.locals.Product;
            
            const foundProducts = await productsCollection.find({ category: categoryName }).toArray();
            
            if (foundProducts.length > 0) {
                console.log(foundProducts);
                res.render("products", { products: foundProducts });
            } else {
                const message = "No products found for this category.";
                res.render("message", { message: message });
            }
        } catch (error) {
            console.error("Error retrieving products:", error);
            res.status(500).send("Internal Server Error");
        }
    });
    

    // Logout route
    app.get('/logout', function(req, res, next){
        req.logout(function(err) {
            if (err) { 
                return next(err); // Pass the error to the error handling middleware
            }
            res.redirect('/');
        });
    });
    
    let port = process.env.PORT || 3000; // Simplified way to set the port
    app.listen(port, function(err) {
        if (err) {
            console.error("Error starting the server:", err);
        } else {
            console.log("Server has started successfully on port", port);
        }
    });
    
