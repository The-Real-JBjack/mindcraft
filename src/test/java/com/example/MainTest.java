package com.example;

import org.junit.jupiter.api.AfterAll;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import static org.junit.jupiter.api.Assertions.*;

import spark.Spark;
import com.google.gson.Gson;
import com.google.gson.reflect.TypeToken;

import java.io.IOException;
import java.lang.reflect.Type;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.util.List;
import java.util.Map;

public class MainTest {

    private static final String BASE_URL = "http://localhost:4567/api/baritone";
    private static HttpClient client;
    private static Gson gson = new Gson();

    @BeforeAll
    public static void setUpClass() {
        // Start the Spark server (Main.main starts it)
        Main.main(null); // This will start the server on port 4567
        Spark.awaitInitialization(); // Wait for the server to be initialized
        client = HttpClient.newHttpClient();
    }

    @AfterAll
    public static void tearDownClass() {
        Spark.stop(); // Stop the Spark server
        Spark.awaitStop(); // Wait for the server to stop
    }

    @BeforeEach
    public void setUp() {
        // Potentially reset state or clear mocks if BaritoneControl was more complex
    }

    // --- BaritoneControl conceptual tests (direct method calls) ---
    // In a real scenario with complex logic in BaritoneControl, these would be more thorough.
    // Since BaritoneControl methods are currently placeholders, these tests are simple.
    @Test
    public void testBaritoneControlAttackEntity() {
        BaritoneControl control = new BaritoneControl();
        assertTrue(control.attackEntity("testEntityId"), "attackEntity should return true (placeholder).");
    }

    @Test
    public void testBaritoneControlKillHostileMobs() {
        BaritoneControl control = new BaritoneControl();
        assertTrue(control.killHostileMobs(), "killHostileMobs should return true (placeholder).");
    }

    @Test
    public void testBaritoneControlDefend() {
        BaritoneControl control = new BaritoneControl();
        assertTrue(control.defend("testEntityToDefend"), "defend should return true (placeholder).");
    }

    @Test
    public void testBaritoneControlInteractWithBlock() {
        BaritoneControl control = new BaritoneControl();
        assertTrue(control.interactWithBlock(1,2,3), "interactWithBlock should return true (placeholder).");
    }

    @Test
    public void testBaritoneControlInteractWithEntity() {
        BaritoneControl control = new BaritoneControl();
        assertTrue(control.interactWithEntity("testEntityId"), "interactWithEntity should return true (placeholder).");
    }

    @Test
    public void testBaritoneControlGetInventory() {
        BaritoneControl control = new BaritoneControl();
        List<Item> inventory = control.getInventory();
        assertNotNull(inventory, "getInventory should return a list (placeholder).");
        // More specific checks could be added based on placeholder data if desired
        assertFalse(inventory.isEmpty(), "Placeholder inventory should not be empty.");
    }

    @Test
    public void testBaritoneControlGetSelectedItem() {
        BaritoneControl control = new BaritoneControl();
        Item selectedItem = control.getSelectedItem();
        assertNotNull(selectedItem, "getSelectedItem should return an item (placeholder).");
        assertEquals("minecraft:iron_pickaxe", selectedItem.name, "Placeholder selected item name mismatch.");
    }

    @Test
    public void testBaritoneControlGetNearbyBlocks() {
        BaritoneControl control = new BaritoneControl();
        List<BlockInfo> blocks = control.getNearbyBlocks(10);
        assertNotNull(blocks);
        assertFalse(blocks.isEmpty());
    }

    @Test
    public void testBaritoneControlGetNearbyEntities() {
        BaritoneControl control = new BaritoneControl();
        List<EntityInfo> entities = control.getNearbyEntities(10);
        assertNotNull(entities);
        assertFalse(entities.isEmpty());
    }

    @Test
    public void testBaritoneControlGetNearbyItems() {
        BaritoneControl control = new BaritoneControl();
        List<DroppedItemInfo> items = control.getNearbyItems(10);
        assertNotNull(items);
        assertFalse(items.isEmpty());
    }


    // --- SparkJava API Endpoint Tests (conceptual HTTP requests) ---
    // These tests demonstrate how API endpoints would be tested.
    // A real test setup might use a library like RestAssured or spark-java-testing for easier assertions.

    private HttpResponse<String> makePostRequest(String path, Object body) throws IOException, InterruptedException {
        String jsonBody = gson.toJson(body);
        HttpRequest request = HttpRequest.newBuilder()
                .uri(URI.create(BASE_URL + path))
                .header("Content-Type", "application/json")
                .POST(HttpRequest.BodyPublishers.ofString(jsonBody))
                .build();
        return client.send(request, HttpResponse.BodyHandlers.ofString());
    }

    private HttpResponse<String> makeGetRequest(String path) throws IOException, InterruptedException {
        HttpRequest request = HttpRequest.newBuilder()
                .uri(URI.create(BASE_URL + path))
                .GET()
                .build();
        return client.send(request, HttpResponse.BodyHandlers.ofString());
    }

    @Test
    public void testAttackApiEndpoint() throws IOException, InterruptedException {
        EntityRequest payload = new EntityRequest();
        payload.entityId = "zombie123";
        HttpResponse<String> response = makePostRequest("/attack", payload);
        assertEquals(200, response.statusCode());
        ApiResponse apiResponse = gson.fromJson(response.body(), ApiResponse.class);
        assertEquals("success", apiResponse.status);
        assertTrue(apiResponse.message.contains("Attack entity command issued for zombie123"));
    }

    @Test
    public void testKillHostileMobsApiEndpoint() throws IOException, InterruptedException {
        HttpResponse<String> response = makePostRequest("/killHostileMobs", new Object()); // Empty body
        assertEquals(200, response.statusCode());
        ApiResponse apiResponse = gson.fromJson(response.body(), ApiResponse.class);
        assertEquals("success", apiResponse.status);
        assertEquals("Kill hostile mobs command issued.", apiResponse.message);
    }

    @Test
    public void testDefendApiEndpoint() throws IOException, InterruptedException {
        EntityRequest payload = new EntityRequest();
        payload.entityId = "playerToDefend";
        HttpResponse<String> response = makePostRequest("/defend", payload);
        assertEquals(200, response.statusCode());
        ApiResponse apiResponse = gson.fromJson(response.body(), ApiResponse.class);
        assertEquals("success", apiResponse.status);
    }

    @Test
    public void testInteractWithBlockApiEndpoint() throws IOException, InterruptedException {
        PositionRequest payload = new PositionRequest();
        payload.x = 10; payload.y = 60; payload.z = 20;
        HttpResponse<String> response = makePostRequest("/interactWithBlock", payload);
        assertEquals(200, response.statusCode());
        ApiResponse apiResponse = gson.fromJson(response.body(), ApiResponse.class);
        assertEquals("success", apiResponse.status);
    }

    @Test
    public void testInteractWithEntityApiEndpoint() throws IOException, InterruptedException {
        EntityRequest payload = new EntityRequest();
        payload.entityId = "villagerJoe";
        HttpResponse<String> response = makePostRequest("/interactWithEntity", payload);
        assertEquals(200, response.statusCode());
        ApiResponse apiResponse = gson.fromJson(response.body(), ApiResponse.class);
        assertEquals("success", apiResponse.status);
    }

    @Test
    public void testGetInventoryApiEndpoint() throws IOException, InterruptedException {
        HttpResponse<String> response = makeGetRequest("/inventory");
        assertEquals(200, response.statusCode());
        ApiResponse apiResponse = gson.fromJson(response.body(), ApiResponse.class);
        assertEquals("success", apiResponse.status);
        assertNotNull(apiResponse.data);
        // Type for List<Item>
        Type listItemType = new TypeToken<List<Item>>() {}.getType();
        List<Item> inventory = gson.fromJson(gson.toJson(apiResponse.data), listItemType);
        assertFalse(inventory.isEmpty());
    }

    @Test
    public void testGetSelectedItemApiEndpoint() throws IOException, InterruptedException {
        HttpResponse<String> response = makeGetRequest("/selectedItem");
        assertEquals(200, response.statusCode());
        ApiResponse apiResponse = gson.fromJson(response.body(), ApiResponse.class);
        assertEquals("success", apiResponse.status);
        assertNotNull(apiResponse.data);
        Item selectedItem = gson.fromJson(gson.toJson(apiResponse.data), Item.class);
        assertEquals("minecraft:iron_pickaxe", selectedItem.name);
    }

    @Test
    public void testGetNearbyBlocksApiEndpoint() throws IOException, InterruptedException {
        HttpResponse<String> response = makeGetRequest("/nearbyBlocks/10");
        assertEquals(200, response.statusCode());
        ApiResponse apiResponse = gson.fromJson(response.body(), ApiResponse.class);
        assertEquals("success", apiResponse.status);
        assertNotNull(apiResponse.data);
        Type listBlockInfoType = new TypeToken<List<BlockInfo>>() {}.getType();
        List<BlockInfo> blocks = gson.fromJson(gson.toJson(apiResponse.data), listBlockInfoType);
        assertFalse(blocks.isEmpty());
    }

    @Test
    public void testGetNearbyEntitiesApiEndpoint() throws IOException, InterruptedException {
        HttpResponse<String> response = makeGetRequest("/nearbyEntities/10");
        assertEquals(200, response.statusCode());
        ApiResponse apiResponse = gson.fromJson(response.body(), ApiResponse.class);
        assertEquals("success", apiResponse.status);
        assertNotNull(apiResponse.data);
    }

    @Test
    public void testGetNearbyItemsApiEndpoint() throws IOException, InterruptedException {
        HttpResponse<String> response = makeGetRequest("/nearbyItems/10");
        assertEquals(200, response.statusCode());
        ApiResponse apiResponse = gson.fromJson(response.body(), ApiResponse.class);
        assertEquals("success", apiResponse.status);
        assertNotNull(apiResponse.data);
    }

    // Helper classes (could be in separate files or as static nested if preferred)
    // For simplicity, duplicating them here as the original Main.java might not have them public for direct import
    // Or, if they were public static nested classes in Main, they could be imported.
    // For this test, a separate definition or making them top-level public in Main.java would be better.
    // Assuming they are accessible for GSON deserialization in this test context.
    // static class EntityRequest { String entityId; }
    // static class PositionRequest { double x, y, z; }
    // static class ApiResponse { String status; String message; Object data; }
    // static class Item { String name; int quantity; }
    // static class BlockInfo { String type; double x,y,z; }
    // static class EntityInfo { String type; String id; double x,y,z; }
    // static class DroppedItemInfo { String itemType; int quantity; double x,y,z; }
}
