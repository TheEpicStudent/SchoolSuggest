

const http = require('http');
const express = require('express');
const app = express();
const path = require('path');
const server = http.createServer(app);
const { execFile } = require("node:child_process");
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

const { readFileSync } = require('fs');
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
    const args = [
        accDbFile,
        `
            SELECT * FROM posts WHERE authID = '${authHeader}';
        `
    ];
    execFile("sqlite3", args, (err, stdout, stderr) => {
        if (err) {
            console.error("[ERROR] Failed to validate token:", err.message);
            if (stderr) console.error(`[STDERR] ${stderr}`);
            res.status(500).json({ valid: false });
            return;
        }
        if (!stdout.trim()) {
            res.status(401).json({ valid: false });
            return;
        }
    res.status(200).json({ valid: true });
    });
});

app.post('/auth/code', express.urlencoded({ extended: true }), (req, res) => {
    const email = req.body.email;
    const recipients = [ { email : email } ];
    if (!email) {
        res.status(400).send('Email is required');
        return;
    }
    const verificationCode = crypto.randomBytes(3).toString('hex').toUpperCase();

    const args = [
        accDbFile,
        `
            UPDATE OTP SET otp = '${verificationCode}' WHERE email = '${email}';
            INSERT INTO OTP (email, otp)
            SELECT '${email}', '${verificationCode}'
            WHERE changes() = 0;
        `
    ];
    execFile("sqlite3", args, (err, stdout, stderr) => {
        if (err) {
            console.error("[ERROR] Failed to store OTP:", err.message);
            if (stderr) console.error(`[STDERR] ${stderr}`);
            res.status(500).send('Failed to generate verification code');
            return;
        }
    });

    client
  .send({
    from: sender,
    to: recipients,
    subject: "Verification Code",
    text: "Your verification code is " + verificationCode + "\n\nIf you did not request this code, you can safely ignore this email.",
    category: "Verification",
  })
  .then(console.log, console.error);
});

app.post('/auth/code/return', express.urlencoded({ extended: true }), (req, res) => {
    const code = req.body.code;
    const email = req.body.email;
    if (!code || !email) {
        res.status(400).send('Code and email are required');
        return;
    }
    const args = [
        accDbFile,
        `
            SELECT * FROM OTP WHERE email = '${email}' AND otp = '${code}';
        `
    ];

    execFile("sqlite3", args, (err, stdout, stderr) => {
        if (err) {
            console.error("[ERROR] Failed to verify OTP:", err.message);
            if (stderr) console.error(`[STDERR] ${stderr}`);
            res.status(500).send('Failed to verify code');
            return;
        }

        if (!stdout.trim()) {
            res.status(401).send('Invalid code');
            return;
        }

        var token = crypto.randomBytes(16).toString('hex');
        if (checkIfUserExists(email) == false) {
            res.status(200).json({ newUser: true, token: token });
        }
        AddAuthToken(email, token);
        res.status(200).json({ token: token });

        const deleteArgs = [
            accDbFile,
            `
                DELETE FROM OTP WHERE email = '${email}';
            `
        ];
        execFile("sqlite3", deleteArgs, (err, stdout, stderr) => {
            if (err) {
                console.error("[ERROR] Failed to delete OTP:", err.message);
                if (stderr) console.error(`[STDERR] ${stderr}`);
                return;
            }
        });
    });
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
    const args = [
        accDbFile,
        `
            INSERT INTO posts (email, authID, Username, Realname)
            VALUES ('${email}', '${authID}', '${username}', '${realname}');
        `
    ];
    execFile("sqlite3", args, (err, stdout, stderr) => {
        if (err) {
            console.error("[ERROR] Failed to create user:", err.message);
            if (stderr) console.error(`[STDERR] ${stderr}`);
            return;
        }
    });
}

app.get('/newuser', (req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/html' });
    const filepath = path.join(__dirname, 'pages', 'newuser.html');
    res.end(readFileSync(filepath));
});

function AddAuthToken(email, token) {
    const args = [
        accDbFile,
        `
            UPDATE posts SET authID = '${token}' WHERE email = '${email}';
        `
    ];
    execFile("sqlite3", args, (err, stdout, stderr) => {
        if (err) {
            console.error("[ERROR] Failed to store auth token:", err.message);
            if (stderr) console.error(`[STDERR] ${stderr}`);
            return;
        }
    });
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
    name = name.replace(/'/g, "''");
    detail = detail.replace(/'/g, "''");
    if (name.includes("<script") || detail.includes("<script") || name.includes("<img") || detail.includes("<img") || name.includes("<iframe") || detail.includes("<iframe") || name.includes("style=") || detail.includes("style=")) {
        name = "Deleted Post";
        detail = "This post was removed for containing disallowed content.";
    }
    const args = [
        dbFile,
        `
            INSERT INTO posts (User, Date, Name, Detail)
            VALUES ('${user}', datetime('now'), '${name}', '${detail}');
        `
    ];
    
    execFile("sqlite3", args, (err, stdout, stderr) => {
        if (err) {
            console.error("[ERROR] Failed to submit post: ", err.message);
            if (stderr) console.error(`[STDERR] ${stderr}`);
            return;
        }
        console.log(`[POST SUBMITTED]\n${name}\n${detail}\n${user}`);
    });
};

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
        const args = [
            accDbFile,
            `
                SELECT * FROM posts WHERE email = '${email}';
            `
        ];
        execFile("sqlite3", args, (err, stdout, stderr) => {
            if (err) {
                resolve(false);
                return;
            }
            resolve(!!stdout.trim());
        });
    });
}

app.get('/userinfo', express.urlencoded({ extended: true }), (req, res) => {
    const token = req.query.token;
    if (!token) {
        res.status(400).send('Token is required');
        return;
    }
    getUserInfo(token)
    .then(user => {
        if (!user) {
            res.status(404).json({ error: 'User not found' });
            return;
        }
        res.status(200).json(user);
    })
    .catch(err => {
        console.error("[ERROR] Failed to get user info:", err);
        res.status(500).json({ error: 'Failed to get user info' });
    });
});

function getUserInfo(token) {
    return new Promise((resolve, reject) => {
        const args = [
            "-json",
            accDbFile,
            `
                SELECT Username, Realname FROM posts WHERE authID = '${token}';
            `
        ];
        execFile("sqlite3", args, (err, stdout, stderr) => {
            if (err) {
                reject(err);
                return;
            }
            try {
                const rows = JSON.parse(stdout || "[]");
                resolve(rows[0] || null);
            } catch (parseErr) {
                reject(parseErr);
            }
        });
    });
}


function getPosts(sort) {
    return new Promise((resolve, reject) => {
        if (sort === "oldest") {
            var order = "Date ASC";
        } else if (sort === "newest") {
            var order = "Date DESC";
        } else if (sort === "mostupvoted") {
            var order = "Votes + 0 DESC";
        } else if (sort === "leastupvoted") {
            var order = "Votes + 0 ASC";
        } else {
            var order = "Date DESC";
        }
        const args = [
            "-json",
            dbFile,
            `
                SELECT PostID, User, Date, Name, Detail, Sticked, hidden, Votes
                FROM posts
                ORDER BY ${order}
                LIMIT 100;
            `
        ];

        execFile("sqlite3", args, (err, stdout, stderr) => {
            if (err) {
                console.error("[ERROR] Failed to retrieve posts:", err.message);
                if (stderr) console.error(`[STDERR] ${stderr}`);
                reject(err);
                return;
            }

            try {
                const rows = JSON.parse(stdout || "[]");
                resolve(rows);
            } catch (parseErr) {
                reject(parseErr);
            }
        });
    });
};

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
    const args = [
        accDbFile,
        `
            SELECT email FROM posts WHERE Username = '${username}' AND adminPass = '${password}' AND Admin = 1;
        `
    ];

    execFile("sqlite3", args, (err, stdout, stderr) => {
        if (err) {
            console.error("[ERROR] Failed to verify admin credentials:", err.message);
            if (stderr) console.error(`[STDERR] ${stderr}`);
            res.status(401).send('Invalid credentials');
            return;
        }

        if (!stdout.trim()) {
            res.status(401).send('Invalid credentials');
            return;
        }

        const authID = crypto.randomBytes(16).toString('hex');
        AddAuthToken(stdout, authID)
        res.status(200).json({ url: "/admin", token: authID });
    });
});


function getAdverts(adID) {
    return new Promise((resolve, reject) => {
        const args = [
            "-json",
            dbFile,
            `
                SELECT * FROM adverts WHERE AdID = ${adID};
            `
        ];
    
        execFile("sqlite3", args, (err, stdout, stderr) => {
            if (err) {
                console.error("[ERROR] Failed to retrieve adverts:", err.message);
                if (stderr) console.error(`[STDERR] ${stderr}`);
                reject(err);
                return;
            }
    
            try {
                const rows = JSON.parse(stdout || "[]");
                resolve(rows);
            } catch (parseErr) {
                reject(parseErr);
            }
        });
    });
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
    if (1 !== 1) {
        res.status(403).send('Forbidden');
        return;
    }
    res.writeHead(200, { 'Content-Type': 'text/html' });
    const filepath = path.join(__dirname, 'pages', 'admin.html');
    res.end(readFileSync(filepath));
});

function votePost(postID, voteType) {
    var number = voteType === 'up' ? '+ 1' : '- 1'
    console.log(`[VOTE] on post ${postID} (${voteType})`);
    const args = [
        dbFile,
        `
            UPDATE posts
            SET Votes = Votes ${number}
            WHERE PostID = ${postID};
        `
    ];
    
    execFile("sqlite3", args, (err, stdout, stderr) => {
        if (err) {
            console.error("[ERROR] Failed to vote on post:", err.message);
            if (stderr) console.error(`[STDERR] ${stderr}`);
            return;
        }
    });
}


app.get('/posts', async (_req, res) => {
    try {
        const posts = await getPosts(_req.query.order);
        res.status(200).json(posts);
    } catch (err) {
        res.status(500).json({ error: 'Failed to load posts' });
    }
});

server.listen(PORT, () => {
    console.log(`Server is on http://localhost:${PORT}`);
    console.log('-----------------------------------');
});
