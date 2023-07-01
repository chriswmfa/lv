import express, { Request, Response, NextFunction, Application } from "express"
import bodyParser from "body-parser"
import { Serializer, Deserializer } from "jsonapi-serializer"
import mysql, { Pool, QueryError, ResultSetHeader, RowDataPacket } from "mysql2"
import jwt from "jsonwebtoken"
import bcrypt from "bcrypt"

interface User {
	id?: number
	name: string
	email: string
	password: string
	role: string
}

interface SerializedUser {
	id: number
	type: string
	attributes: User
}

const app: Application = express()

app.use(bodyParser.urlencoded({ extended: false }))
app.use(bodyParser.json())

// Create a MySQL connection pool
const pool: Pool = mysql.createPool({
	host: "localhost",
	database: "",
	user: "",
	password: "",
})

const userSerializer: Serializer = new Serializer("user", {
	attributes: ["name", "email", "password", "role"],
})

const userDeserializer: Deserializer = new Deserializer({
	keyForAttribute: "camelCase",
})

/**
 * Executes a MySQL query and returns a promise.
 * @param {string} sql - The SQL query string.
 * @param {any[]} [values] - The parameter values for the query.
 * @returns {Promise<any>} - A promise that resolves with the query results.
 */
const query = (sql: string, values?: any[]): Promise<any> => {
	return new Promise((resolve, reject) => {
		pool.getConnection((err, connection: mysql.PoolConnection) => {
			if (err) {
				console.error(err)
				return
			}

			connection.query(sql, values, (err, results: RowDataPacket[] | RowDataPacket[][]) => {
				connection.release()

				if (err) {
					reject(err)
				} else {
					resolve(results)
				}
			})
		})
	})
}

/**
 * Middleware to authenticate a user based on the access token in the request headers.
 * @param {Request} req - The request object.
 * @param {Response} res - The response object.
 * @param {NextFunction} next - The next function to call.
 * @returns {Promise<void>} - Promise that resolves if authentication is successful, or sends an error response otherwise.
 */
const authenticate = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
	const accessToken: string = req.headers["access-token"] as string

	if (!accessToken || !req.headers.email) {
		throw new Error("Unauthorized")
	}

	try {
		const requestToken: string = jwt.verify(accessToken, "oranges") as string

		const sql: string = "SELECT * FROM users WHERE email = ?"
		const result: RowDataPacket[] = await query(sql, [req.headers.email])

		const userToken: string = jwt.verify(result[0].accessToken, "oranges") as string

		if (requestToken === userToken) {
			next()
		} else {
			throw new Error("Forbidden")
		}
	} catch (err) {
		console.error(err)
		throw new Error("Internal Server Error")
	}
}

/**
 * Middleware to check if a user has the "ADMIN" role.
 * @param {Request} req - The request object.
 * @param {Response} res - The response object.
 * @param {NextFunction} next - The next function to call.
 * @returns {Promise<void>} - Promise that resolves if the user has the "ADMIN" role, or sends an error response otherwise.
 */
const userIsAdmin = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
	try {
		await authenticate(req, res, async () => {
			const email = req.headers.email

			// Fetch the user from the database
			const result: RowDataPacket[] = await query("SELECT * FROM users WHERE email = ?", [email])

			// Check if the user's role is "ADMIN"
			if (result.length > 0 && result[0].role === "ADMIN") {
				return next()
			} else {
				res.sendStatus(403)
				return
			}
		})
	} catch (err) {
		console.error(err)
		res.sendStatus(500)
	}
}

/**
 * Middleware to check if a user is accessing their own data.
 * @param {Request} req - The request object.
 * @param {Response} res - The response object.
 * @param {NextFunction} next - The next function to call.
 * @returns {Promise<void>} - Promise that resolves if the user is accessing their own data, or sends an error response otherwise.
 */
const userIsSelfOrAdmin = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
	try {
		await authenticate(req, res, async () => {
			const userId: string = req.params.id
			const userRole: string = req.headers["user-role"] as string

			// Check if the user is the self or an admin
			if (userId === req.params.id || userRole === "ADMIN") {
				return next()
			} else {
				res.sendStatus(403)
				return
			}
		})
	} catch (err) {
		console.error(err)
		res.sendStatus(500)
	}
}

/**
 * Endpoint to create a new user.
 */
app.post("/users", async (req: Request, res: Response) => {
	try {
		await authenticate(req, res, async () => {
			const user: User = (await userDeserializer.deserialize(req.body)) as User

			const hashedPassword: string = await bcrypt.hash(user.password, 10)

			// Save the user to the database with the hashed password
			const sql: string = "INSERT INTO users SET ?"
			const result: ResultSetHeader = await query(sql, [{
				...user,
				password: hashedPassword,
			}])

			// Fetch the created user from the database
			const userId: number = result.insertId
			const createdUser: RowDataPacket[] = await query("SELECT * FROM users WHERE id = ?", [userId])

			// Serialize and send the response
			const serializedUser: SerializedUser = userSerializer.serialize(createdUser[0]) as SerializedUser
			res.json(serializedUser)
		})
	} catch (err) {
		console.error(err)
		res.sendStatus(500)
	}
})


/**
 * Endpoint to get a user by ID.
 */
app.get("/users/:id", async (req: Request, res: Response) => {
	try {
		await userIsSelfOrAdmin(req, res, async () => {
			const userId: string = req.params.id

			// Fetch the user from the database
			const result: RowDataPacket[] = await query("SELECT * FROM users WHERE id = ?", [userId])
			if (result.length === 0) {
				return res.sendStatus(404)
			}

			// Serialize and send the response
			const serializedUser: SerializedUser = userSerializer.serialize(result[0]) as SerializedUser
			res.json(serializedUser)
		})
	} catch (err) {
		console.error(err)
		res.sendStatus(500)
	}
})

/**
 * Endpoint to update a user by ID.
 */
app.patch("/users/:id", async (req: Request, res: Response) => {
	try {
		await userIsSelfOrAdmin(req, res, async () => {
			const userId: string = req.params.id
			const updatedFields: User = (await userDeserializer.deserialize(req.body)) as User

			// Update the user in the database
			const sql: string = "UPDATE users SET ? WHERE id = ?"
			const values: [User, string] = [updatedFields, userId]
			await query(sql, values)

			// Fetch the updated user from the database
			const result: RowDataPacket[] = await query("SELECT * FROM users WHERE id = ?", [userId])

			// Serialize and send the response
			const serializedUser: SerializedUser = userSerializer.serialize(result[0]) as SerializedUser
			res.json(serializedUser)
		})
	} catch (err) {
		console.error(err)
		res.sendStatus(500)
	}
})

/**
 * Endpoint to update a user by ID.
 */
app.patch("/users/:id", async (req: Request, res: Response) => {
	try {
		await userIsSelfOrAdmin(req, res, async () => {
			const userId: string = req.params.id
			const updatedFields: User = (await userDeserializer.deserialize(req.body)) as User

			// Update the user in the database
			const sql: string = "UPDATE users SET ? WHERE id = ?"
			const values: [User, string] = [updatedFields, userId]
			await query(sql, values)

			// Fetch the updated user from the database
			const result: RowDataPacket[] = await query("SELECT * FROM users WHERE id = ?", [userId])

			// Serialize and send the response
			const serializedUser: SerializedUser = userSerializer.serialize(result[0]) as SerializedUser
			res.json(serializedUser)
		})
	} catch (err) {
		console.error(err)
		res.sendStatus(500)
	}
})

/**
 * Endpoint to update a users role.
 */
app.patch("/users/:id/role", async (req: Request, res: Response) => {
	try {
		await userIsAdmin(req, res, async () => {
			const user: User = (await userDeserializer.deserialize(req.body)) as User

			const userId: string = req.params.id
			const newRole: string = user.role

			// Update the user's role in the database
			const sql: string = "UPDATE users SET role = ? WHERE id = ?"
			await query(sql, [newRole, userId])

			// Fetch the updated user from the database
			const result: RowDataPacket[] = await query("SELECT * FROM users WHERE id = ?", [userId])

			// Serialize and send the response
			const serializedUser: SerializedUser = userSerializer.serialize(result[0]) as SerializedUser
			res.json(serializedUser)
		})
	} catch (err) {
		console.error(err)
		res.sendStatus(500)
	}
})

/**
 * Endpoint to get all users
 */
app.get("/users", async (req: Request, res: Response) => {
	try {
		await userIsAdmin(req, res, async () => {
			// Fetch all users from the database
			const result: RowDataPacket[] = await query("SELECT * FROM users")

			// Serialize and send the response
			const serializedUsers: SerializedUser[] = userSerializer.serialize(result) as SerializedUser[]
			res.json(serializedUsers)
		})
	} catch (err) {
		console.error(err)
		res.sendStatus(500)
	}
})

/**
 * Endpoint to delete a user by ID
 */
app.delete("/users/:id", async (req: Request, res: Response) => {
	try {
		await userIsAdmin(req, res, async () => {
			const userId = req.params.id

			// Delete the user from the database
			await query("DELETE FROM users WHERE id = ?", [userId])

			res.sendStatus(204)
		})
	} catch (err) {
		console.error(err)
		res.sendStatus(500)
	}
})

app.listen(3000, () => {
	console.log("Server is running on port 3000")
})
