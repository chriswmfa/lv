const request = require("supertest")
const app = require("../dist/index").default

describe("User API", () => {
	let userId = 5
	let adminToken = "eyJhbGciOiJIUzI1NiJ9.MTIzNDU.9QjOsdJVpQcafvZ2Xq5CrrP96x5fMPuPbBNjAtFco9Q"
	let email = (Math.random() + 1).toString(36).substring(7) + "@gmail.com"
	let createdUserId

	it("should create a new user", async () => {
		const response = await request(app)
			.post("/users")
			.send({
				data: {
					type: "user",
					attributes: {
						name: "Test User",
						email: email,
						password: "password",
						role: "USER",
					},
				},
			})
			.set("access-token", adminToken)
			.set("email", "admin@example.com")
			.expect(200)

		const { data } = response.body
		createdUserId = data.id
		expect(data.id).toBeDefined()
		expect(data.attributes.name).toBe("Test User")
		expect(data.attributes.email).toBe(email)
		expect(data.attributes.role).toBe("USER")
	})

	it("should get a user by ID", async () => {
		const response = await request(app).get(`/users/${createdUserId}`).set("access-token", adminToken).set("email", "johndoe@example.com").expect(200)

		const { data } = response.body
		expect(data.id).toBe(createdUserId)
		expect(data.attributes.name).toBe("Test User")
		expect(data.attributes.email).toBe(email)
		expect(data.attributes.role).toBe("USER")
	})

	it("should update a user by ID", async () => {
		const response = await request(app)
			.patch(`/users/${createdUserId}`)
			.send({
				data: {
					type: "user",
					attributes: {
						name: "Test User Updated",
					},
				},
			})
			.set("access-token", adminToken)
			.set("email", "johndoe@example.com")
			.expect(200)

		const { data } = response.body
		expect(data.id).toBe(createdUserId)
		expect(data.attributes.name).toBe("Test User Updated")
	})

	it("should update a user role by ID (only for admins)", async () => {
		const response = await request(app)
			.patch(`/users/${createdUserId}/role`)
			.send({
				data: {
					type: "user",
					attributes: {
						role: "ADMIN",
					},
				},
			})
			.set("access-token", adminToken)
			.set("email", "admin@example.com")
			.expect(200)

		const { data } = response.body
		expect(data.id).toBe(createdUserId)
		expect(data.attributes.role).toBe("ADMIN")
	})

	it("should delete a user by ID", async () => {
		await request(app).delete(`/users/${createdUserId}`).expect(204).set("access-token", adminToken).set("email", "admin@example.com")
	})
})
