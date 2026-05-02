const dotenv = require('dotenv');
dotenv.config();
var servermode = process.env.SERVERMODE || "unknown";
if (servermode == "dev") {
    console.log("[DEV MODE] Verbose logging enabled");
    var verboseLog = console.log;
    console.log = function(...args) {
        const timestamp = new Date().toISOString();
        verboseLog(`[${timestamp}]`, ...args);
    };
    console.dev = function(...args) {
        const timestamp = new Date().toISOString();
        verboseLog(`[${timestamp}] [DEV]`, ...args);
    }
} else if (servermode == "prod") {
    console.log("[PRODUCTION MODE] Server is running normally");
    console.dev = function(...args) {}
} else {
    console.warn("[WARNING] It looks like you don't have a valid SERVERMODE set. You can set it in your .env file as 'prod' or 'dev'. Defaulting to prod mode.");
    servermode = "prod";
    console.dev = function(...args) {}
}
const sanitizeHtml = require('sanitize-html');
const http = require('http');
const express = require('express');
const app = express();
const path = require('path');
const server = http.createServer(app);
const Database = require('better-sqlite3');
const crypto = require("crypto");
const { MailtrapClient } = require("mailtrap");

const TOKEN = process.env.MAILTRAPTOKEN || "your-mailtrap-token-here";

const client = new MailtrapClient({
  token: TOKEN,
});

const sender = {
  email: "verify@theepicstudent.xyz",
  name: "Caleb K",
};



const dbFile = process.env.POSTDB || "posts.sqlite";
const accDbFile = process.env.ACCOUNTDB || "accounts.sqlite";

// Open SQLite databases
const postsDb = new Database(dbFile);
const accountsDb = new Database(accDbFile);

const { readFileSync } = require('fs');
const { get } = require('node:http');
const { parse } = require('path');
const PORT = process.env.PORT || 8030;

app.use(express.static(path.join(__dirname + '/pages')));

app.get('/', (req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/html' });
    const filepath = path.join(__dirname, 'pages', 'index.html');
    res.end(readFileSync(filepath));
});

app.get('/login', (req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/html' });
    const filepath = path.join(__dirname, 'pages', 'login.html');
    res.end(readFileSync(filepath));
});

app.get('/schoolname', (req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end(process.env.SCHOOLNAME || 'Example School');
});


app.get('/auth/validate', express.urlencoded({ extended: true }), (req, res) => {
    const authHeader = req.query.token;
    if (!authHeader) {
        res.status(401).json({ valid: false });
        return;
    }
    try {
        const row = accountsDb.prepare('SELECT * FROM posts WHERE authID = ?').get(authHeader);
        if (!row) {
            res.status(401).json({ valid: false });
            return;
        }
        res.status(200).json({ valid: true });
    } catch (err) {
        console.error("[ERROR] Failed to validate token:", err.message);
        res.status(500).json({ valid: false });
    }
});

app.post('/reply', express.urlencoded({ extended: true }), (req, res) => {
    const { postID, authID, content } = req.body;
    if (!postID || !authID || !content) {
        res.status(400).send('Missing required fields');
        return;
    }
    submitReply(postID, authID, content);
    res.status(200).send('Reply submitted');
});

function getReplies(postID) {
    try {
        const row = postsDb.prepare('SELECT * FROM replies WHERE PostID = ?').get(postID);
        if (!row) return [];
        // repliesJSON is a stringified array
        return JSON.parse(row.repliesJSON || '[]');
    } catch (err) {
        console.error("[ERROR] Failed to retrieve replies:", err.message);
        return [];
    }
}

function submitReply(postID, authID, content) {
    let safeContent = sanitizeHtml(content, { allowedTags: [], allowedAttributes: {} }).trim();
    if (safeContent === "") {
        safeContent = "(Deleted)";
    }
    let username = "";
    try {
        const user = getUserInfo(authID);
        username = user ? user.Username : "";
    } catch (err) {
        username = "";
    }
    try {
        const row = postsDb.prepare(`SELECT repliesJSON FROM replies WHERE PostID = ?`).get(postID);
        let replies = [];
        console.dev(replies);
        if (row && row.repliesJSON) {
            try {
                replies = JSON.parse(row.repliesJSON);
            } catch (err) {
                replies = [];
            }
        }
        console.dev(replies);
        replies.push({ username, content: safeContent });
        console.dev(replies);
        postsDb.prepare('UPDATE replies SET repliesJSON = ? WHERE PostID = ?').run(JSON.stringify(replies), postID);
    } catch (err) {
        console.error("[ERROR] Failed to submit reply:", err.message);
    }
}

function checkIfAdmin(AuthID) {
    try {
        const row = accountsDb.prepare('SELECT Admin FROM posts WHERE authID = ?').get(AuthID);
        return row ? row.Admin === 1 : false;
    } catch (err) {
        console.error("[ERROR] Failed to check admin status:", err.message);
        return false;
    }
}

app.get('/admin/check', express.urlencoded({ extended: true }), (req, res) => {
    const authID = req.query.token;
    if (!authID) {
        res.status(400).json({ isAdmin: false });
        return;
    }
    try {
        const row = accountsDb.prepare('SELECT Admin FROM posts WHERE authID = ?').get(authID);
        const isAdmin = row ? row.Admin === 1 : false;
        res.status(200).json({ isAdmin });
    } catch (err) {
        console.error("[ERROR] Failed to check admin status:", err.message);
        res.status(500).json({ isAdmin: false });
    }
});

app.post('/admin/hide', express.urlencoded({ extended: true}), (req, res) => {
    res.send('unfinished');
})

function hidePost(postID, AuthID) {
    if (checkIfAdmin(AuthID) == false) {
        return;
    }
    try {
        postsDb.prepare('UPDATE posts SET hidden = 1 WHERE PostID = ?').run(postID);
    } catch (err) {
        console.error("[ERROR] Failed to hide post:", err.message);
    }
}

app.post('/auth/code', express.urlencoded({ extended: true }), (req, res) => {
    const email = req.body.email;
    const recipients = [ { email : email } ];
    if (!email) {
        res.status(400).send('Email is required');
        return;
    }
    const verificationCode = crypto.randomBytes(3).toString('hex').toUpperCase();
    try {
        // Try update, if no row updated, insert
        const update = accountsDb.prepare('UPDATE OTP SET otp = ? WHERE email = ?');
        const result = update.run(verificationCode, email);
        if (result.changes === 0) {
            accountsDb.prepare('INSERT INTO OTP (email, otp) VALUES (?, ?)').run(email, verificationCode);
        }
    } catch (err) {
        console.error("[ERROR] Failed to store OTP:", err.message);
        res.status(500).send('Failed to generate verification code');
        return;
    }
    client
      .send({
        from: sender,
        to: recipients,
        subject: "Verification Code",
        text: "Your verification code is " + verificationCode + "\n\nIf you did not request this code, you can safely ignore this email.",
        category: "Verification",
      })
      .then(console.dev, console.error);
});

app.post('/auth/code/return', express.urlencoded({ extended: true }), (req, res) => {
    const code = req.body.code;
    const email = req.body.email;
    if (!code || !email) {
        res.status(400).send('Code and email are required');
        return;
    }
    try {
        const row = accountsDb.prepare('SELECT * FROM OTP WHERE email = ? AND otp = ?').get(email, code);
        if (!row) {
            res.status(401).send('Invalid code');
            return;
        }
        var token = crypto.randomBytes(16).toString('hex');
        if (!checkIfUserExistsSync(email)) {
            res.status(200).json({ newUser: true, token: token });
        }
        AddAuthToken(email, token);
        res.status(200).json({ token: token });
        accountsDb.prepare('DELETE FROM OTP WHERE email = ?').run(email);
    } catch (err) {
        console.error("[ERROR] Failed to verify OTP:", err.message);
        res.status(500).send('Failed to verify code');
    }
});

app.post('/newuser', express.urlencoded({ extended: true }), (req, res) => {
    const { email, username, realname } = req.body;
    if (!email || !username || !realname) {
        res.status(400).send('Missing required fields');
        return;
    }
    const authID = crypto.randomBytes(16).toString('hex');
    createUser(email, authID, username, realname);
    res.redirect('/login');
});

function createUser(email, authID, username, realname) {
    try {
        accountsDb.prepare('INSERT INTO posts (email, authID, Username, Realname) VALUES (?, ?, ?, ?)').run(email, authID, username, realname);
    } catch (err) {
        console.error("[ERROR] Failed to create user:", err.message);
    }
}

app.get('/newuser', (req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/html' });
    const filepath = path.join(__dirname, 'pages', 'newuser.html');
    res.end(readFileSync(filepath));
});

function AddAuthToken(email, token) {
    try {
        accountsDb.prepare('UPDATE posts SET authID = ? WHERE email = ?').run(token, email);
    } catch (err) {
        console.error("[ERROR] Failed to store auth token:", err.message);
    }
}

app.get('/submit', (req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/html' });
    const filepath = path.join(__dirname, 'pages', 'submit.html');
    res.end(readFileSync(filepath));
});

app.post('/submit', express.urlencoded({ extended: true }), (req, res) => {
    const { name, detail, user } = req.body;
    if (!name || !detail || !user) {
        res.status(400).send('Missing required fields');
        return;
    }
    submitPost(name, detail, user);
    res.redirect('/');
});

function submitPost(name, detail, user) {
    let safeName = name.replace(/'/g, "''");
    let safeDetail = detail.replace(/'/g, "''");
    if (sanitizeHtml(safeName, { allowedTags: [], allowedAttributes: {} }).trim() === "" || sanitizeHtml(safeDetail, { allowedTags: [], allowedAttributes: {} }).trim() === "") {
        safeName = "Deleted Post";
        safeDetail = "This post was removed for containing disallowed content.";
    }
    try {
        const insert = postsDb.prepare('INSERT INTO posts (User, Date, Name, Detail) VALUES (?, datetime(\'now\'), ?, ?)');
        const info = insert.run(user, safeName, safeDetail);
        const postId = info.lastInsertRowid;
        postsDb.prepare('INSERT INTO replies (PostID, repliesJSON) VALUES (?, ?)').run(postId, '[]');
        console.log(`[POST SUBMITTED]\n${safeName}\n${safeDetail}\n${user}`);
    } catch (err) {
        console.error("[ERROR] Failed to submit post: ", err.message);
    }
}

app.post('/usrchk', express.urlencoded({ extended: true }), (req, res) => {
    const email = req.body.usrmail;
    if (!email) {
        res.status(400).send('Email is required');
        return;
    }
    checkIfUserExists(email)
    .then(exists => {
        if (!exists) {
            res.status(404).json({ exists: false });
            return;
        }
            res.status(200).json({ exists });
        })
        .catch(err => {
            console.error("[ERROR] Failed to check if user exists:", err);
            res.status(500).json({ error: 'Failed to check user' });
        });
});

function checkIfUserExists(email) {
    return new Promise((resolve, _reject) => {
        try {
            const row = accountsDb.prepare('SELECT * FROM posts WHERE email = ?').get(email);
            resolve(!!row);
        } catch (err) {
            resolve(false);
        }
    });
}

function checkIfUserExistsSync(email) {
    try {
        const row = accountsDb.prepare('SELECT * FROM posts WHERE email = ?').get(email);
        return !!row;
    } catch (err) {
        return false;
    }
}

app.get('/userinfo', express.urlencoded({ extended: true }), (req, res) => {
    const token = req.query.token;
    if (!token) {
        res.status(400).send('Token is required');
        return;
    }
    var info = getUserInfo(token)
    try {
        var user = info
            if (!user) {
                res.status(404).json({ error: 'User not found' });
                return;
            }
            res.status(200).json(user);
    } catch (error) {
        console.error("[ERROR] Failed to get user info:", error);
        res.status(500).json({ error: 'Failed to get user info' });
    }
});

function getUserInfo(token) {
    try {
        const row = accountsDb.prepare('SELECT Username, Realname FROM posts WHERE authID = ?').get(token);
        return row || null;
    } catch (err) {
        console.error("[ERROR] Failed to get user info:", err.message);
        return null;
    }
}


function getPosts(sort) {
    let order = "Date DESC";
    if (sort === "oldest") {
        order = "Date ASC";
    } else if (sort === "newest") {
        order = "Date DESC";
    } else if (sort === "mostupvoted") {
        order = "Votes + 0 DESC";
    } else if (sort === "leastupvoted") {
        order = "Votes + 0 ASC";
    }
    try {
        const rows = postsDb.prepare(`SELECT PostID, User, Date, Name, Detail, Sticked, hidden, Votes FROM posts ORDER BY ${order} LIMIT 100`).all();
        return rows;
    } catch (err) {
        console.error("[ERROR] Failed to retrieve posts:", err.message);
        return [];
    }
}

app.post('/vote', express.urlencoded({ extended: true }), (req, res) => {
    const { postID, voteType } = req.body;
    if (!postID || !voteType || !['up', 'down'].includes(voteType)) {
        res.status(400).send('Invalid vote data');
        return;
    }
    votePost(postID, voteType);
    res.status(200).send('Vote recorded');
});

app.get('/notes', (req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/html' });
    const filepath = path.join(__dirname, 'pages', 'patch.html');
    res.end(readFileSync(filepath));
});

app.post('/admin/verify', express.urlencoded({ extended: true }), (req, res) => {
    const username = req.body.username;
    const password = req.body.password;
    try {
        const row = accountsDb.prepare('SELECT email FROM posts WHERE Username = ? AND adminPass = ? AND Admin = 1').get(username, password);
        if (!row) {
            res.status(401).send('Invalid credentials');
            return;
        }
        const authID = crypto.randomBytes(16).toString('hex');
        AddAuthToken(row.email, authID);
        res.status(200).json({ url: "/admin", token: authID });
    } catch (err) {
        console.error("[ERROR] Failed to verify admin credentials:", err.message);
        res.status(401).send('Invalid credentials');
    }
});


function getAdverts(adID) {
    try {
        const rows = postsDb.prepare('SELECT * FROM adverts WHERE AdID = ?').all(adID);
        return rows;
    } catch (err) {
        console.error("[ERROR] Failed to retrieve adverts:", err.message);
        return [];
    }
}

app.get('/adverts/:id', async (req, res) => {
    try {
        const adverts = await getAdverts(req.params.id);
        res.status(200).json(adverts);
    } catch (err) {
        res.status(500).json({ error: 'Failed to load adverts' });
    }
});


app.get('/admin', express.urlencoded({ extended: true }), (req, res) => {
    if (!req.query.token) {
        res.status(403).send('Forbidden');
        return;
    }
    
    const row = accountsDb.prepare('SELECT email FROM posts WHERE AuthID = ? AND Admin = 1').get(req.query.token);
        if (!row) {
            res.status(403).send('Invalid credentials');
            return;
        }


    res.writeHead(200, { 'Content-Type': 'text/html' });
    const filepath = path.join(__dirname, 'pages', 'admin.html');
    res.end(readFileSync(filepath));
});

function findStickies() {
    try {
        const rows = postsDb.prepare('SELECT PostID FROM posts WHERE Sticked = 1').all();
        return rows.map(row => row.PostID);
    } catch (err) {
        console.error("[ERROR] Failed to retrieve stickied posts:", err.message);
        return [];
    }
}

app.get('/stuck', async (req, res) => {
    try {
        const stickies = await findStickies();
        res.status(200).json({list: stickies});
    } catch (err) {
        res.status(500).json({ error: 'Failed to load stickied posts' });
    }
});

function votePost(postID, voteType) {
    var number = voteType === 'up' ? 1 : -1;
    console.log(`[VOTE] on post ${postID} (${voteType})`);
    try {
        postsDb.prepare('UPDATE posts SET Votes = Votes + ? WHERE PostID = ?').run(number, postID);
    } catch (err) {
        console.error("[ERROR] Failed to vote on post:", err.message);
    }
}

app.get('/schoolcoc', (req, res) => {
    res.status(200).json(process.env.SCHOOLCOC);
});

app.get('/posts', async (_req, res) => {
    try {
        const posts = await getPosts(_req.query.order);
        res.status(200).json(posts);
    } catch (err) {
        res.status(500).json({ error: 'Failed to load posts' });
    }
});

app.get('/post/:id', (req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/html' });
    const filepath = path.join(__dirname, 'pages', 'post.html');
    res.end(readFileSync(filepath));
});

app.get('/postdata/:id', async (req, res) => {
    const postID = req.params.id;
    try {
        const post = postsDb.prepare('SELECT PostID, User, Date, Name, Detail, Votes FROM posts WHERE PostID = ?').get(postID);
        const replies = getReplies(postID);
        res.status(200).json({ post, replies });
    } catch (err) {
        console.error("[ERROR] Failed to retrieve post data:", err.message);
        res.status(500).json({ error: 'Failed to load post data' });
    }
});


server.listen(PORT, () => {
    console.log(`[STARTED] Server is running on port ${PORT} in ${servermode} mode`);
});
